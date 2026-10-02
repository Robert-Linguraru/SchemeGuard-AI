package org.schemeguard.backend.service;

import org.schemeguard.backend.dto.*;
import org.schemeguard.backend.entity.AnomalyDetectionJob;
import org.schemeguard.backend.entity.TransactionOutlier;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.entity.enums.AnomalyJobStatus;
import org.schemeguard.backend.exception.ConflictException;
import org.schemeguard.backend.exception.ResourceNotFoundException;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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

    public TransactionAnomalyService(UploadRepository uploadRepository,
            TransactionRepository transactionRepository, TransactionOutlierRepository outlierRepository,
            AnomalyDetectionJobRepository jobRepository, AnomalyRulesEngine rulesEngine) {
        this.uploadRepository = uploadRepository;
        this.transactionRepository = transactionRepository;
        this.outlierRepository = outlierRepository;
        this.jobRepository = jobRepository;
        this.rulesEngine = rulesEngine;
    }

    @Transactional
    public AnomalyJobResponse requestDetection(User user, UUID uploadId) {
        var upload = ownedEvaluatedUpload(user, uploadId);
        AnomalyDetectionJob job = jobRepository.findByUpload_Id(uploadId).orElseGet(() -> {
            AnomalyDetectionJob created = new AnomalyDetectionJob();
            created.setUpload(upload);
            return jobRepository.save(created);
        });
        if (job.getStatus() == AnomalyJobStatus.FAILED) {
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

    @Transactional
    public boolean processNextPendingJob() {
        var candidate = jobRepository.findFirstByStatusOrderByRequestedAt(AnomalyJobStatus.PENDING);
        if (candidate.isEmpty()) return false;
        AnomalyDetectionJob job = candidate.get();
        job.setStatus(AnomalyJobStatus.RUNNING);
        job.setUpdatedAt(Instant.now());
        job.setErrorMessage(null);
        try {
            UUID uploadId = job.getUpload().getId();
            List<MlTransaction> transactions = transactionRepository.findMlTransactionsForUpload(uploadId)
                    .stream().map(this::toMlTransaction).toList();
            List<UUID> outlierIds = rulesEngine.detect(transactions);
            outlierRepository.deleteAllByUploadId(uploadId);
            var transactionMap = transactionRepository.findAllById(outlierIds).stream()
                    .collect(java.util.stream.Collectors.toMap(t -> t.getId(), t -> t));
            for (UUID id : outlierIds) {
                var transaction = transactionMap.get(id);
                if (transaction != null && transaction.getUpload() != null
                        && uploadId.equals(transaction.getUpload().getId())) {
                    TransactionOutlier outlier = new TransactionOutlier();
                    outlier.setUpload(job.getUpload());
                    outlier.setTransaction(transaction);
                    outlier.setDetectedAt(Instant.now());
                    outlierRepository.save(outlier);
                }
            }
            job.setStatus(AnomalyJobStatus.COMPLETED);
        } catch (RuntimeException exception) {
            job.setStatus(AnomalyJobStatus.FAILED);
            String message = exception.getMessage();
            job.setErrorMessage(message == null ? "Anomaly detection failed" : message.substring(0, Math.min(1000, message.length())));
        }
        job.setUpdatedAt(Instant.now());
        return true;
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

    private org.schemeguard.backend.entity.Upload ownedEvaluatedUpload(User user, UUID id) {
        var upload = ownedUpload(user, id);
        if (!upload.isWasEvaluated()) throw new ConflictException("The upload must be evaluated before detecting outliers.");
        return upload;
    }

    private org.schemeguard.backend.entity.Upload ownedUpload(User user, UUID id) {
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
