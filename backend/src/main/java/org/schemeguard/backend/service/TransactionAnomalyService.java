package org.schemeguard.backend.service;

import org.schemeguard.backend.dto.*;
import org.schemeguard.backend.entity.AnomalyDetectionJob;
import org.schemeguard.backend.entity.AnomalyDetectionInput;
import org.schemeguard.backend.entity.TransactionOutlier;
import org.schemeguard.backend.entity.TransactionOutlierExplanation;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.entity.enums.AnomalyJobStatus;
import org.schemeguard.backend.exception.ConflictException;
import org.schemeguard.backend.exception.ResourceNotFoundException;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.csvuploads.UploadRepository;
import org.schemeguard.backend.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class TransactionAnomalyService {
    private final UploadRepository uploadRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionOutlierRepository outlierRepository;
    private final AnomalyDetectionJobRepository jobRepository;
    private final AnomalyRulesEngine rulesEngine;
    private final AnomalyDetectionInputRepository inputRepository;
    private final TransactionTemplate workerTransaction;
    private final TransactionOutlierExplanationRepository explanationRepository;

    public TransactionAnomalyService(UploadRepository uploadRepository,
            TransactionRepository transactionRepository, TransactionOutlierRepository outlierRepository,
            AnomalyDetectionJobRepository jobRepository, AnomalyRulesEngine rulesEngine,
            AnomalyDetectionInputRepository inputRepository, PlatformTransactionManager transactionManager,
            TransactionOutlierExplanationRepository explanationRepository) {
        this.uploadRepository = uploadRepository;
        this.transactionRepository = transactionRepository;
        this.outlierRepository = outlierRepository;
        this.jobRepository = jobRepository;
        this.rulesEngine = rulesEngine;
        this.inputRepository = inputRepository;
        this.workerTransaction = new TransactionTemplate(transactionManager);
        this.explanationRepository = explanationRepository;
    }

    @Transactional
    public AnomalyJobResponse requestDetection(User user, UUID uploadId) {
        var upload = uploadRepository.lockForAnomalyDetection(uploadId, user.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Upload not found."));
        if (!upload.isWasEvaluated()) throw new ConflictException("The upload must be evaluated before detecting outliers.");
        AnomalyDetectionJob job = jobRepository.findByUpload_Id(uploadId).orElseGet(() -> {
            AnomalyDetectionJob created = new AnomalyDetectionJob();
            created.setUpload(upload);
            return jobRepository.save(created);
        });
        if (job.getStatus() == AnomalyJobStatus.RUNNING || job.getStatus() == AnomalyJobStatus.PENDING) return response(job);
        String fingerprint = fingerprint(uploadId);
        var input = inputRepository.findById(job.getId()).orElse(null);
        if (input == null || !fingerprint.equals(input.getFingerprint()) || job.getStatus() == AnomalyJobStatus.FAILED) {
            if (input == null) {
                input = new AnomalyDetectionInput();
                input.setJobId(job.getId());
            }
            input.setFingerprint(fingerprint);
            inputRepository.save(input);
            job.setStatus(AnomalyJobStatus.PENDING);
            job.setErrorMessage(null);
            job.setRequestedAt(Instant.now());
            job.setUpdatedAt(Instant.now());
        }
        return response(job);
    }

    @Transactional(readOnly = true)
    public AnomalyJobResponse getJob(User user, UUID uploadId) {
        ownedUpload(user, uploadId);
        return jobRepository.findByUpload_Id(uploadId).map(this::response)
                .orElseThrow(() -> new ResourceNotFoundException("Anomaly detection has not been requested"));
    }

    public boolean processNextPendingJob() {
        UUID jobId = workerTransaction.execute(ignored -> {
            var candidate = jobRepository.lockNextJob(Instant.now().minusSeconds(1800));
            if (candidate.isEmpty()) return null;
            var job = candidate.get();
            job.setStatus(AnomalyJobStatus.RUNNING);
            job.setUpdatedAt(Instant.now());
            job.setErrorMessage(null);
            return job.getId();
        });
        if (jobId == null) return false;
        try {
            workerTransaction.executeWithoutResult(ignored -> processJob(jobId));
        } catch (RuntimeException exception) {
            // Persist failure in a separate transaction after result writes roll back.
            workerTransaction.executeWithoutResult(ignored -> {
                var job = jobRepository.lockById(jobId).orElseThrow();
                job.setStatus(AnomalyJobStatus.FAILED);
                String message = exception.getMessage();
                job.setErrorMessage(message == null ? "Anomaly detection failed" : message.substring(0, Math.min(1000, message.length())));
                job.setUpdatedAt(Instant.now());
            });
        }
        return true;
    }

    private void processJob(UUID jobId) {
            AnomalyDetectionJob job = jobRepository.lockById(jobId).orElseThrow();
            UUID uploadId = job.getUpload().getId();
            String fingerprint = fingerprint(uploadId);
            List<MlTransaction> transactions = transactionRepository.findMlTransactionsForUpload(uploadId)
                    .stream().map(this::toMlTransaction).toList();
            if (transactions.isEmpty() || transactions.size() != transactionRepository.countByUpload_Id(uploadId)) {
                throw new ConflictException("Some transactions have no active evaluation or fee. Evaluate the complete upload before detecting outliers.");
            }
            var findings = rulesEngine.analyze(transactions);
            List<UUID> outlierIds = findings.keySet().stream().sorted().toList();
            // Preserve manual review flags for transactions that remain outliers.
            var detected = new java.util.HashSet<>(outlierIds);
            var existing = outlierRepository.findAllByUploadId(uploadId);
            outlierRepository.deleteAll(existing.stream().filter(o -> !detected.contains(o.getTransaction().getId())).toList());
            var existingIds = existing.stream().map(o -> o.getTransaction().getId()).collect(java.util.stream.Collectors.toSet());
            var outlierMap = existing.stream().collect(java.util.stream.Collectors.toMap(o -> o.getTransaction().getId(), o -> o));
            var transactionMap = transactionRepository.findAllById(outlierIds).stream()
                    .collect(java.util.stream.Collectors.toMap(t -> t.getId(), t -> t));
            for (UUID id : outlierIds) {
                if (existingIds.contains(id)) {
                    saveExplanation(outlierMap.get(id), findings.get(id));
                    continue;
                }
                var transaction = transactionMap.get(id);
                if (transaction != null && transaction.getUpload() != null
                        && uploadId.equals(transaction.getUpload().getId())) {
                    TransactionOutlier outlier = new TransactionOutlier();
                    outlier.setUpload(job.getUpload());
                    outlier.setTransaction(transaction);
                    outlier.setDetectedAt(Instant.now());
                    saveExplanation(outlierRepository.save(outlier), findings.get(id));
                }
            }
            if (!fingerprint.equals(fingerprint(uploadId))) {
                throw new ConflictException("Upload data changed during detection. Please retry.");
            }
            var input = inputRepository.findById(jobId).orElseGet(() -> {
                var created = new AnomalyDetectionInput();
                created.setJobId(jobId);
                return created;
            });
            input.setFingerprint(fingerprint);
            inputRepository.save(input);
            job.setStatus(AnomalyJobStatus.COMPLETED);
            job.setUpdatedAt(Instant.now());
    }

    @Transactional(readOnly = true)
    public List<AnomalyReason> findReasons(User user, UUID uploadId, UUID transactionId) {
        ownedUpload(user, uploadId);
        var outlier = outlierRepository.findByUploadIdAndTransactionId(uploadId, transactionId)
                .orElseThrow(() -> new ResourceNotFoundException("Transaction is not marked as an outlier"));
        return explanationRepository.findById(outlier.getId())
                .map(TransactionOutlierExplanation::getReasons).orElseGet(List::of);
    }

    private void saveExplanation(TransactionOutlier outlier, List<AnomalyReason> reasons) {
        var explanation = new TransactionOutlierExplanation();
        explanation.setOutlierId(outlier.getId());
        explanation.setReasons(reasons);
        explanationRepository.save(explanation);
    }

    @Transactional(readOnly = true)
    public List<UUID> findOutlierIds(User user, UUID uploadId) {
        ownedUpload(user, uploadId);
        return outlierRepository.findAllByUploadId(uploadId).stream()
                .map(outlier -> outlier.getTransaction().getId()).toList();
    }

    @Transactional
    public void confirm(User user, UUID uploadId, UUID transactionId) {
        ownedUpload(user, uploadId);
        var outlier = outlierRepository.findByUploadIdAndTransactionId(uploadId, transactionId)
                .orElseThrow(() -> new ResourceNotFoundException("Transaction is not marked as an outlier"));
        outlier.setManuallyConfirmed(true);
        outlier.setConfirmedAt(Instant.now());
    }

    private String fingerprint(UUID uploadId) {
        return AnomalyRulesEngine.VERSION + ":" + transactionRepository.anomalyInputFingerprint(uploadId);
    }

    private org.schemeguard.backend.entity.csvuploads.Upload ownedUpload(User user, UUID id) {
        return uploadRepository.findById(id).filter(u -> u.getUser().getId().equals(user.getId()))
                .orElseThrow(() -> new UploadException(org.springframework.http.HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND", "Upload not found."));
    }

    private MlTransaction toMlTransaction(MlTransactionProjection p) {
        return new MlTransaction(p.getId(), p.getExternalId(), p.getScheme(), p.getAmount(), p.getCurrency(),
                p.getCardType(), p.getCardCategory(), p.getChannel(), p.getIssuerCountry(), p.getMerchantCountry(),
                p.getThreeDsUsed(), p.getCvvPresent(), p.getMerchantDataComplete(), p.getClearingDelayDays(),
                p.getQualificationStatus(), p.getQualificationCategory(), p.getRuleCode(), p.getInterchangeRate());
    }

    private AnomalyJobResponse response(AnomalyDetectionJob job) {
        return new AnomalyJobResponse(job.getId(), job.getUpload().getId(), job.getStatus(), job.getErrorMessage());
    }
}
