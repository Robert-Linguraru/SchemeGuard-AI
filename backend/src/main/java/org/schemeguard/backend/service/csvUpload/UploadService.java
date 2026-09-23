package org.schemeguard.backend.service.csvUpload;

import org.schemeguard.backend.dto.Upload.CompleteUploadResponse;
import org.schemeguard.backend.dto.Upload.CreateUploadRequest;
import org.schemeguard.backend.dto.Upload.CreateUploadResponse;
import org.schemeguard.backend.dto.Upload.PartUploadResponse;
import org.schemeguard.backend.dto.Upload.UploadPageResponse;
import org.schemeguard.backend.dto.Upload.UploadStatusResponse;
import org.schemeguard.backend.dto.Upload.UploadSummaryResponse;
import org.schemeguard.backend.entity.ProcessingJob;
import org.schemeguard.backend.entity.Upload;
import org.schemeguard.backend.entity.UploadPart;
import org.schemeguard.backend.entity.UploadSession;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.entity.enums.JobStatus;
import org.schemeguard.backend.entity.enums.JobType;
import org.schemeguard.backend.entity.enums.UploadStatus;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.ProcessingJobRepository;
import org.schemeguard.backend.repository.UploadPartRepository;
import org.schemeguard.backend.repository.UploadRepository;
import org.schemeguard.backend.repository.UploadSummaryProjection;
import org.schemeguard.backend.repository.UploadSessionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.io.InputStream;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class UploadService {

        private static final int DEFAULT_PAGE_SIZE = 20;
        private static final int MAX_PAGE_SIZE = 100;

    private final UploadSessionRepository sessionRepository;
    private final UploadRepository uploadRepository;
    private final UploadPartRepository partRepository;
    private final ProcessingJobRepository processingJobRepository;
    private final UploadPolicy policy;
    private final StorageService storageService;
    private final TransactionBatchWriter transactionBatchWriter;
    private final PartRegistrationService partRegistrationService;
    private final ObjectProvider<CsvImportService> csvImportServiceProvider;
    private final JdbcTemplate jdbcTemplate;

    public UploadService(
            UploadSessionRepository sessionRepository,
            UploadRepository uploadRepository,
            UploadPartRepository partRepository,
            ProcessingJobRepository processingJobRepository,
            UploadPolicy policy,
            StorageService storageService,
            TransactionBatchWriter transactionBatchWriter,
            PartRegistrationService partRegistrationService,
            ObjectProvider<CsvImportService> csvImportServiceProvider,
            JdbcTemplate jdbcTemplate
    ) {
        this.sessionRepository = sessionRepository;
        this.uploadRepository = uploadRepository;
        this.partRepository = partRepository;
        this.processingJobRepository = processingJobRepository;
        this.policy = policy;
        this.storageService = storageService;
        this.transactionBatchWriter = transactionBatchWriter;
        this.partRegistrationService = partRegistrationService;
        this.csvImportServiceProvider = csvImportServiceProvider;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public CreateUploadResponse createUpload(CreateUploadRequest request, User user) {
        policy.validateCreateRequest(request.fileName(), request.fileSizeBytes());
        int totalParts = policy.calculateTotalParts(request.fileSizeBytes());
        UUID uploadId = UUID.randomUUID();

        UploadSession session = new UploadSession(
                uploadId,
                request.fileName(),
                request.fileSizeBytes(),
                totalParts,
                normalizeHash(request.fileSha256())
        );
        ProcessingJob processingJob = processingJobRepository.save(
                newProcessingJob(request.fileName())
        );
        session.setProcessingJobId(processingJob.getId());
        session = sessionRepository.save(session);
        Upload upload = uploadRepository.save(new Upload(user, session, new byte[0]));
        storageService.createUploadDirectory(uploadId);

        return new CreateUploadResponse(
                uploadId,
                upload.getId(),
                policy.getChunkSizeBytes(),
                totalParts,
                policy.getMaxParallelUploads()
        );
    }

    public PartUploadResponse uploadPart(
            UUID uploadId,
            int partNumber,
            InputStream input,
            String clientSha256
    ) {
        UploadSession session = getSession(uploadId);
        policy.validatePartNumber(partNumber, session.getExpectedTotalParts());

        if (session.getStatus() != UploadStatus.UPLOADING) {
            throw new UploadException(
                    HttpStatus.CONFLICT,
                    "UPLOAD_NOT_ACCEPTING_PARTS",
                    "This upload no longer accepts parts."
            );
        }

        long expectedSize = policy.expectedPartSize(
                session.getExpectedFileSizeBytes(),
                partNumber
        );
        StorageService.TempPart temporaryPart = storageService.writeTemporaryPart(
                uploadId,
                partNumber,
                input,
                expectedSize
        );

        String normalizedClientHash = normalizeHash(clientSha256);
        if (normalizedClientHash != null
                && !normalizedClientHash.equals(temporaryPart.sha256())) {
            storageService.deleteTemporaryPart(temporaryPart);
            throw new UploadException(
                    HttpStatus.BAD_REQUEST,
                    "PART_CHECKSUM_MISMATCH",
                    "The upload part checksum is invalid."
            );
        }

        return partRegistrationService.registerPart(
                uploadId,
                partNumber,
                temporaryPart
        );
    }

    @Transactional
    public CompleteUploadResponse completeUpload(UUID uploadId) {
        UploadSession session = sessionRepository.findByIdForUpdate(uploadId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload session not found."
                ));

        if (session.getStatus() == UploadStatus.QUEUED
                || session.getStatus() == UploadStatus.PROCESSING
                || session.getStatus() == UploadStatus.COMPLETED) {
            return toCompleteResponse(session);
        }

        if (session.getStatus() != UploadStatus.UPLOADING) {
            throw new UploadException(
                    HttpStatus.CONFLICT,
                    "UPLOAD_CANNOT_COMPLETE",
                    "This upload cannot be completed."
            );
        }

        if (session.getUploadedParts() != session.getExpectedTotalParts()
                || session.getUploadedBytes() != session.getExpectedFileSizeBytes()) {
            throw new UploadException(
                    HttpStatus.CONFLICT,
                    "UPLOAD_INCOMPLETE",
                    "Not all upload parts have been received."
            );
        }

        List<UploadPart> parts = partRepository
                .findAllByUploadIdOrderByPartNumber(uploadId);
        if (parts.size() != session.getExpectedTotalParts()) {
            throw new UploadException(
                    HttpStatus.CONFLICT,
                    "UPLOAD_INCOMPLETE",
                    "Not all upload parts have been received."
            );
        }

        session.setStatus(UploadStatus.QUEUED);
        sessionRepository.save(session);
        runImportAfterCommit(uploadId);
        return toCompleteResponse(session);
    }

    @Transactional(readOnly = true)
    public UploadStatusResponse getStatus(UUID uploadId) {
        return toStatusResponse(getSession(uploadId));
    }

    @Transactional(readOnly = true)
    public UploadPageResponse findUploads(
            User user,
            int requestedPage,
            int requestedSize,
            String search
    ) {
        int page = Math.max(requestedPage, 0);
        int size = requestedSize <= 0
                ? DEFAULT_PAGE_SIZE
                : Math.min(requestedSize, MAX_PAGE_SIZE);
        Pageable pageable = PageRequest.of(page, size);
        Page<UploadSummaryProjection> resultPage = uploadRepository
                .findSummariesByUserId(user.getId(), search, pageable);

        List<UploadSummaryResponse> content = resultPage.getContent().stream()
                .map(this::toSummaryResponse)
                .toList();

        return new UploadPageResponse(
                content,
                page,
                size,
                resultPage.getTotalElements(),
                resultPage.getTotalPages()
        );
    }

    @Transactional
    public void cancelUpload(UUID uploadId) {
        UploadSession session = sessionRepository.findByIdForUpdate(uploadId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload session not found."
                ));

        if (session.getStatus() == UploadStatus.COMPLETED) {
            throw new UploadException(
                    HttpStatus.CONFLICT,
                    "UPLOAD_CANNOT_CANCEL",
                    "A completed upload cannot be cancelled."
            );
        }

        if (session.getStatus() == UploadStatus.CANCELLED) {
            return;
        }

        session.setStatus(UploadStatus.CANCELLED);
        sessionRepository.save(session);
        if (session.getProcessingJobId() != null) {
            processingJobRepository.findById(session.getProcessingJobId())
                    .ifPresent(processingJobRepository::delete);
        }
        storageService.deleteUpload(uploadId);
    }

    public UploadSession getSession(UUID uploadId) {
        return sessionRepository.findById(uploadId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload session not found."
                ));
    }

    public List<UploadPart> getParts(UUID uploadId) {
        return partRepository.findAllByUploadIdOrderByPartNumber(uploadId);
    }

    @Transactional
    public boolean markProcessing(UUID uploadId) {
        UploadSession session = sessionRepository.findByIdForUpdate(uploadId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload session not found."
                ));

        if (session.getStatus() != UploadStatus.QUEUED) {
            return false;
        }

        session.setStatus(UploadStatus.PROCESSING);
        session.setErrorMessage(null);
        sessionRepository.save(session);
        updateProcessingJob(session.getProcessingJobId(), JobStatus.RUNNING, 0, 0, null);
        return true;
    }

    @Transactional(readOnly = true)
    public boolean isCancellationRequested(UUID uploadId) {
        Boolean cancelled = jdbcTemplate.queryForObject(
                """
                        SELECT EXISTS (
                            SELECT 1
                            FROM upload_sessions
                            WHERE id = ? AND status = 'CANCELLED'
                        )
                        """,
                Boolean.class,
                uploadId
        );
        return Boolean.TRUE.equals(cancelled);
    }

    @Transactional
    public void commitImportedTransactions(
            UUID uploadId,
            UUID uploadRecordId,
            long processedRows
    ) {
        UploadSession session = sessionRepository.findByIdForUpdate(uploadId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload session not found."
                ));

        if (session.getStatus() != UploadStatus.PROCESSING) {
            throw new UploadCancelledException();
        }

        // The row lock above makes cancellation and the final merge mutually
        // exclusive. A cancellation that wins the race prevents this merge;
        // a merge that wins the race completes the upload before cancellation.
        transactionBatchWriter.mergeStagedRows(uploadRecordId);
        session.setProcessedRows(processedRows);
        session.setStatus(UploadStatus.COMPLETED);
        session.setErrorMessage(null);
        sessionRepository.save(session);
        updateProcessingJob(
                session.getProcessingJobId(),
                JobStatus.COMPLETED,
                processedRows,
                0,
                null
        );
    }

    @Transactional
    public void updateProcessedRows(UUID uploadId, long processedRows) {
        jdbcTemplate.update(
                """
                        UPDATE upload_sessions
                        SET processed_rows = ?, updated_at = now()
                        WHERE id = ?
                        """,
                processedRows,
                uploadId
        );
        jdbcTemplate.update(
                """
                        UPDATE processing_jobs
                        SET status = 'RUNNING',
                            processed_records = ?,
                            total_records = ?,
                            failed_records = 0,
                            error_message = NULL
                        WHERE id = (
                            SELECT processing_job_id
                            FROM upload_sessions
                            WHERE id = ?
                        )
                        """,
                Math.toIntExact(processedRows),
                Math.toIntExact(processedRows),
                uploadId
        );
    }

    @Transactional
    public void markFailed(UUID uploadId, String message, long processedRows) {
        String safeMessage = message == null
                ? "Import failed."
                : message.substring(0, Math.min(message.length(), 1000));
        sessionRepository.findById(uploadId).ifPresent(session -> {
            session.setProcessedRows(processedRows);
            session.setStatus(UploadStatus.FAILED);
            session.setErrorMessage(safeMessage);
            sessionRepository.save(session);
            updateProcessingJob(
                    session.getProcessingJobId(),
                    JobStatus.FAILED,
                    processedRows,
                    1,
                    safeMessage
            );
        });
    }

    private void runImportAfterCommit(UUID uploadId) {
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        csvImportServiceProvider.getObject().importAsync(uploadId);
                    }
                }
        );
    }

    private ProcessingJob newProcessingJob(String fileName) {
        ProcessingJob job = new ProcessingJob();
        job.setJobType(JobType.CSV_IMPORT);
        job.setFileName(fileName);
        job.setStatus(JobStatus.PENDING);
        job.setTotalRecords(0);
        job.setProcessedRecords(0);
        job.setFailedRecords(0);
        return job;
    }

    private void updateProcessingJob(
            UUID processingJobId,
            JobStatus status,
            long processedRows,
            int failedRecords,
            String errorMessage
    ) {
        if (processingJobId == null) {
            return;
        }
        processingJobRepository.findById(processingJobId).ifPresent(job -> {
            job.setStatus(status);
            job.setProcessedRecords(Math.toIntExact(processedRows));
            job.setTotalRecords(Math.toIntExact(processedRows));
            job.setFailedRecords(failedRecords);
            job.setErrorMessage(errorMessage);
            if (status == JobStatus.COMPLETED || status == JobStatus.FAILED) {
                job.setCompletedAt(java.time.Instant.now());
            }
            processingJobRepository.save(job);
        });
    }

    private UploadStatusResponse toStatusResponse(UploadSession session) {
        StoredUploadMetadata upload = getStoredUploadMetadata(session.getId());
        return new UploadStatusResponse(
                session.getId(),
                upload.id(),
                session.getOriginalFileName(),
                session.getStatus(),
                session.getExpectedFileSizeBytes(),
                session.getUploadedBytes(),
                session.getUploadedParts(),
                session.getExpectedTotalParts(),
                session.getProcessedRows(),
                session.getErrorMessage(),
                upload.uploadedAt()
        );
    }

    private UploadSummaryResponse toSummaryResponse(UploadSummaryProjection projection) {
        return new UploadSummaryResponse(
                projection.getId(),
                projection.getFileName(),
                projection.getUploadedAt(),
                projection.getImportStatus(),
                projection.getWasEvaluated(),
                projection.getTransactionCount() > 0
                        && projection.getNewTransactionCount() == 0
                        ? "EVALUATED"
                        : "NOT_EVALUATED",
                projection.getTransactionCount()
        );
        }

    private CompleteUploadResponse toCompleteResponse(UploadSession session) {
        StoredUploadMetadata upload = getStoredUploadMetadata(session.getId());
        return new CompleteUploadResponse(
                session.getId(),
                upload.id(),
                session.getStatus(),
                session.getUploadedParts(),
                session.getExpectedTotalParts()
        );
    }

    private StoredUploadMetadata getStoredUploadMetadata(UUID sessionId) {
        try {
            return jdbcTemplate.queryForObject(
                    """
                            SELECT id, uploaded_at
                            FROM uploads
                            WHERE session_id = ?
                            """,
                    (resultSet, rowNumber) -> new StoredUploadMetadata(
                            resultSet.getObject("id", UUID.class),
                            resultSet.getTimestamp("uploaded_at").toInstant()
                    ),
                    sessionId
            );
        } catch (EmptyResultDataAccessException exception) {
            throw new UploadException(
                    HttpStatus.NOT_FOUND,
                    "UPLOAD_DOCUMENT_NOT_FOUND",
                    "Stored upload document not found."
            );
        }
    }

    public Upload getStoredUpload(UUID sessionId) {
        return uploadRepository.findBySession_Id(sessionId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_DOCUMENT_NOT_FOUND",
                        "Stored upload document not found."
                ));
    }

    private String normalizeHash(String hash) {
        return hash == null || hash.isBlank()
                ? null
                : hash.toLowerCase(Locale.ROOT);
    }

    private record StoredUploadMetadata(UUID id, java.time.Instant uploadedAt) {
    }
}
