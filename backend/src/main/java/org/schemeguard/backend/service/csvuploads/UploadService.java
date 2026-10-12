package org.schemeguard.backend.service.csvuploads;

import org.schemeguard.backend.dto.csvuploads.CompleteUploadResponse;
import org.schemeguard.backend.dto.csvuploads.CreateUploadRequest;
import org.schemeguard.backend.dto.csvuploads.CreateUploadResponse;
import org.schemeguard.backend.dto.csvuploads.PartUploadResponse;
import org.schemeguard.backend.dto.csvuploads.UploadPageResponse;
import org.schemeguard.backend.dto.csvuploads.UploadStatusResponse;
import org.schemeguard.backend.dto.csvuploads.UploadSummaryResponse;
import org.schemeguard.backend.entity.ProcessingJob;
import org.schemeguard.backend.entity.csvuploads.Upload;
import org.schemeguard.backend.entity.csvuploads.UploadPart;
import org.schemeguard.backend.entity.csvuploads.UploadSession;
import org.schemeguard.backend.entity.csvuploads.TransactionSource;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.entity.enums.JobStatus;
import org.schemeguard.backend.entity.enums.JobType;
import org.schemeguard.backend.entity.csvuploads.UploadStatus;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.ProcessingJobRepository;
import org.schemeguard.backend.repository.csvuploads.UploadPartRepository;
import org.schemeguard.backend.repository.csvuploads.UploadRepository;
import org.schemeguard.backend.repository.csvuploads.UploadSummaryProjection;
import org.schemeguard.backend.repository.csvuploads.UploadSessionRepository;
import org.schemeguard.backend.service.csvuploads.csvUploadTimeLogger.UploadTimeLogger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.beans.factory.annotation.Autowired;
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

    private static final Logger log = LoggerFactory.getLogger(UploadService.class);

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
    private final UploadTimeLogger uploadTimeLogger;
    private final TransactionSourceService transactionSourceService;
    private final TransactionDeduplicationService deduplicationService;

    @Autowired
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
            JdbcTemplate jdbcTemplate,
            UploadTimeLogger uploadTimeLogger,
            TransactionSourceService transactionSourceService,
            TransactionDeduplicationService deduplicationService
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
        this.uploadTimeLogger = uploadTimeLogger;
        this.transactionSourceService = transactionSourceService;
        this.deduplicationService = deduplicationService;
    }

    /** Keeps direct service construction compatible with existing callers. */
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
        this(
                sessionRepository,
                uploadRepository,
                partRepository,
                processingJobRepository,
                policy,
                storageService,
                transactionBatchWriter,
                partRegistrationService,
                csvImportServiceProvider,
                jdbcTemplate,
                new UploadTimeLogger(jdbcTemplate),
                null,
                null
        );
    }

    @Transactional
    public CreateUploadResponse createUpload(CreateUploadRequest request, User user) {
        policy.validateCreateRequest(request.fileName(), request.fileSizeBytes());
        TransactionSource source = transactionSourceService.resolveOrCreate(request.sourceName());
        int totalParts = policy.calculateTotalParts(request.fileSizeBytes());
        UUID uploadId = UUID.randomUUID();

        UploadSession session = new UploadSession(
                uploadId,
                request.fileName(),
                request.fileSizeBytes(),
                totalParts,
                normalizeHash(request.fileSha256())
        );
        session.setUserId(user.getId());
        ProcessingJob processingJob = processingJobRepository.save(
                newProcessingJob(request.fileName())
        );
        session.setProcessingJobId(processingJob.getId());
        session = sessionRepository.save(session);
        Upload upload = uploadRepository.save(new Upload(user, session, source, new byte[0]));
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
            String clientSha256,
            UUID userId
    ) {
        java.time.Instant startedAt = java.time.Instant.now();
        long startedAtNanos = System.nanoTime();
        try {
            UploadSession session = getSession(uploadId);
            assertUploadOwnedBy(uploadId, userId);
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
        } finally {
            uploadTimeLogger.recordPartRequest(
                    uploadId,
                    startedAt,
                    System.nanoTime() - startedAtNanos
            );
        }
    }

    @Transactional
    public CompleteUploadResponse completeUpload(UUID uploadId, UUID userId) {
        assertUploadOwnedBy(uploadId, userId);
        UploadSession session = sessionRepository.findByIdForUpdate(uploadId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload session not found."
                ));

        if (session.getStatus() == UploadStatus.QUEUED
                || session.getStatus() == UploadStatus.PROCESSING
                || session.getStatus() == UploadStatus.FINALIZING
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
    public UploadStatusResponse getStatus(UUID uploadId, UUID userId) {
        assertUploadOwnedBy(uploadId, userId);
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
        return toUploadPage(resultPage, page, size);
    }

    @Transactional(readOnly = true)
    public UploadPageResponse findUploads(
            User user,
            int requestedPage,
            int requestedSize,
            String search,
            String requestedSort
    ) {
        int page = Math.max(requestedPage, 0);
        int size = requestedSize <= 0
                ? DEFAULT_PAGE_SIZE
                : Math.min(requestedSize, MAX_PAGE_SIZE);
        Pageable pageable = PageRequest.of(page, size);
        SortOptions sort = parseSort(requestedSort);
        Page<UploadSummaryProjection> resultPage = uploadRepository
                .findSummariesByUserId(
                        user.getId(), search, sort.field(), sort.direction(), pageable
                );

        return toUploadPage(resultPage, page, size);
    }

    private UploadPageResponse toUploadPage(
            Page<UploadSummaryProjection> resultPage,
            int page,
            int size
    ) {
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

    private SortOptions parseSort(String requestedSort) {
        String[] parts = requestedSort == null ? new String[0] : requestedSort.split(",", 2);
        String field = parts.length > 0 ? parts[0].trim() : "";
        if (!List.of("fileName", "uploadedAt", "transactionCount")
                .contains(field)) {
            field = "uploadedAt";
        }
        String direction = parts.length > 1 && "asc".equalsIgnoreCase(parts[1].trim())
                ? "asc"
                : "desc";
        return new SortOptions(field, direction);
    }

    @Transactional
    public void cancelUpload(UUID uploadId, UUID userId) {
        assertUploadOwnedBy(uploadId, userId);
        UploadSession session = sessionRepository.findByIdForUpdate(uploadId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload session not found."
                ));

        if (session.getStatus() == UploadStatus.COMPLETED
                || session.getStatus() == UploadStatus.DUPLICATE) {
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
        session.setErrorMessage("Upload cancelled.");
        sessionRepository.save(session);
        finishUploadAfterCommit(uploadId);
        if (session.getProcessingJobId() != null) {
            processingJobRepository.findById(session.getProcessingJobId())
                    .ifPresent(processingJobRepository::delete);
        }
        uploadRepository.findBySession_Id(session.getId()).ifPresent(upload -> {
            transactionBatchWriter.clearImportRows(upload.getId());
            session.detachUpload();
            uploadRepository.delete(upload);
        });
        storageService.deleteUpload(uploadId);
    }

    @Transactional
    public void deleteUploadDocument(UUID uploadId, UUID userId) {
        Upload upload = uploadRepository.findByIdAndUser_Id(uploadId, userId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload document not found."
                ));
        UUID sessionId = upload.getSession().getId();
        UploadSession session = sessionRepository.findByIdForUpdate(sessionId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload document not found."
                ));

        transactionBatchWriter.clearImportRows(uploadId);
        session.detachUpload();
        jdbcTemplate.update(
                """
                        DELETE FROM fee_calculations fee
                        USING qualification_results qr, transactions tx
                        WHERE fee.qualification_result_id = qr.id
                          AND qr.transaction_id = tx.id
                          AND tx.upload_id = ?
                        """,
                uploadId
        );
        jdbcTemplate.update(
                """
                        DELETE FROM qualification_results qr
                        USING transactions tx
                        WHERE qr.transaction_id = tx.id
                          AND tx.upload_id = ?
                        """,
                uploadId
        );
        jdbcTemplate.update(
                """
                        DELETE FROM ml_predictions prediction
                        USING transactions tx
                        WHERE prediction.transaction_id = tx.id
                          AND tx.upload_id = ?
                        """,
                uploadId
        );
        jdbcTemplate.update("DELETE FROM transactions WHERE upload_id = ?", uploadId);
        uploadRepository.delete(upload);
        uploadRepository.flush();
        sessionRepository.delete(session);
        sessionRepository.flush();
        if (session.getProcessingJobId() != null) {
            processingJobRepository.findById(session.getProcessingJobId())
                    .ifPresent(processingJobRepository::delete);
        }
        runAfterCommit(() -> {
            try {
                storageService.deleteUpload(sessionId);
            } catch (RuntimeException exception) {
                log.warn("Could not clean temporary files for deleted upload {}", sessionId, exception);
            }
        });
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
        runAfterCommit(() -> uploadTimeLogger.markProcessingStarted(uploadId));
        updateProcessingJob(session.getProcessingJobId(), JobStatus.RUNNING, 0, 0, null);
        return true;
    }

    @Transactional
    public boolean markFinalizing(UUID uploadId) {
        UploadSession session = sessionRepository.findByIdForUpdate(uploadId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload session not found."
                ));

        if (session.getStatus() != UploadStatus.PROCESSING) {
            return false;
        }

        session.setStatus(UploadStatus.FINALIZING);
        sessionRepository.save(session);
        return true;
    }

    @Transactional(readOnly = true)
    public boolean isCancellationRequested(UUID uploadId) {
        Boolean cancelled = jdbcTemplate.queryForObject(
                """
                        SELECT NOT EXISTS (
                            SELECT 1
                            FROM upload_sessions
                            WHERE id = ?
                        ) OR EXISTS (
                            SELECT 1
                            FROM upload_sessions
                            WHERE id = ? AND status = 'CANCELLED'
                        )
                        """,
                Boolean.class,
                uploadId,
                uploadId
        );
        return Boolean.TRUE.equals(cancelled);
    }

    @Transactional
    public UploadStatusResponse commitImportedTransactions(
            UUID uploadId,
            UUID uploadRecordId,
            long processedRows,
            boolean analystConfirmed
    ) {
        UploadSession session = sessionRepository.findByIdForUpdate(uploadId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload session not found."
                ));

        if (session.getStatus() != UploadStatus.FINALIZING
                && !(analystConfirmed && session.getStatus() == UploadStatus.DUPLICATES_FOUND)) {
            throw new UploadCancelledException();
        }

        // The row lock above makes cancellation and the final merge mutually
        // exclusive. A cancellation that wins the race prevents this merge;
        // a merge that wins the race completes the upload before cancellation.
        boolean reviewingPersistedRows = session.getStatus() == UploadStatus.DUPLICATES_FOUND;
        deduplicationService.lockSource(uploadRecordId);
        TransactionDeduplicationService.DuplicateSummary duplicateSummary = reviewingPersistedRows
                ? deduplicationService.refreshReviewDuplicateMarks(uploadRecordId)
                : deduplicationService.refreshStagedDuplicateMarks(uploadRecordId);
        boolean duplicateSetChanged = !java.util.Objects.equals(
                session.getDuplicateSignature(),
                duplicateSummary.signature()
        );
        if (duplicateSummary.count() > 0
                && (!analystConfirmed || duplicateSetChanged)) {
            if (!reviewingPersistedRows) {
                // The status change and durable row copy share this transaction. A review
                // session therefore never points at rows held only in unlogged staging.
                transactionBatchWriter.persistStagedRowsForReview(uploadRecordId);
            }
            session.setProcessedRows(processedRows);
            session.setDuplicateRows(duplicateSummary.count());
            session.setDuplicateSignature(duplicateSummary.signature());
            session.setStatus(UploadStatus.DUPLICATES_FOUND);
            session.setErrorMessage(
                    "Found " + duplicateSummary.count()
                            + " duplicate transactions. Review the report to continue."
            );
            sessionRepository.save(session);
            updateProcessingJob(
                    session.getProcessingJobId(),
                    JobStatus.COMPLETED,
                    processedRows,
                    0,
                    null
            );
            finishUploadAfterCommit(uploadId);
            return toStatusResponse(session);
        }
        if (analystConfirmed
                && processedRows > 0
                && duplicateSummary.count() >= processedRows) {
            throw new UploadException(
                    HttpStatus.CONFLICT,
                    "NO_UNIQUE_TRANSACTIONS",
                    "All transactions in this file are duplicates; there are no new transactions to import."
            );
        }
        long mergeStartedAtNanos = System.nanoTime();
        long importedRows = reviewingPersistedRows
                ? transactionBatchWriter.mergeReviewRows(uploadRecordId)
                : transactionBatchWriter.mergeStagedRows(uploadRecordId);
        long mergeElapsedNanos = System.nanoTime() - mergeStartedAtNanos;
        runAfterCommit(() -> uploadTimeLogger.recordFinalMerge(uploadId, mergeElapsedNanos));
        session.setProcessedRows(importedRows);
        session.setDuplicateRows(duplicateSummary.count());
        session.setDuplicateSignature(duplicateSummary.signature());
        session.setStatus(UploadStatus.COMPLETED);
        session.setErrorMessage(null);
        sessionRepository.save(session);
        updateProcessingJob(
                session.getProcessingJobId(),
                JobStatus.COMPLETED,
                importedRows,
                0,
                null
        );
        finishUploadAfterCommit(uploadId);
        return toStatusResponse(session);
    }

    @Transactional
    public UploadStatusResponse confirmDuplicateImport(UUID uploadId, UUID userId) {
        assertUploadOwnedBy(uploadId, userId);
        UploadSession session = sessionRepository.findByIdForUpdate(uploadId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload session not found."
                ));
        if (session.getStatus() != UploadStatus.DUPLICATES_FOUND) {
            throw new UploadException(
                    HttpStatus.CONFLICT,
                    "UPLOAD_NOT_AWAITING_DUPLICATE_DECISION",
                    "This upload is not waiting for a duplicate decision."
            );
        }
        UUID uploadRecordId = uploadRepository.findBySession_IdAndUser_Id(
                        session.getId(), userId
                )
                .map(Upload::getId)
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload document not found."
                ));
        return commitImportedTransactions(
                uploadId,
                uploadRecordId,
                session.getProcessedRows(),
                true
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
            session.setDuplicateRows(0);
            session.setDuplicateSignature(null);
            session.setStatus(UploadStatus.FAILED);
            session.setErrorMessage(safeMessage);
            sessionRepository.save(session);
            jdbcTemplate.update(
                    "UPDATE uploads SET content_sha256 = NULL WHERE session_id = ?",
                    uploadId
            );
            updateProcessingJob(
                    session.getProcessingJobId(),
                    JobStatus.FAILED,
                    processedRows,
                    1,
                    safeMessage
            );
            finishUploadAfterCommit(uploadId);
        });
    }

    @Transactional
    public void markDuplicate(
            UUID uploadId,
            UUID uploadRecordId,
            long processedRows
    ) {
        sessionRepository.findByIdForUpdate(uploadId).ifPresent(session -> {
            if (session.getStatus() != UploadStatus.PROCESSING) {
                return;
            }
            session.setProcessedRows(processedRows);
            session.setStatus(UploadStatus.DUPLICATE);
            session.setErrorMessage(DuplicateUploadException.USER_MESSAGE);
            sessionRepository.save(session);
            jdbcTemplate.update(
                    "UPDATE uploads SET content_sha256 = NULL WHERE session_id = ?",
                    uploadId
            );
            finishUploadAfterCommit(uploadId);
            // Duplicate attempts must not appear in upload history or keep a
            // copy of their document. Keep the session briefly so the polling
            // client can still receive the DUPLICATE result.
            jdbcTemplate.update(
                    "DELETE FROM uploads WHERE id = ? AND session_id = ?",
                    uploadRecordId,
                    uploadId
            );
            updateProcessingJob(
                    session.getProcessingJobId(),
                    JobStatus.FAILED,
                    processedRows,
                    1,
                    DuplicateUploadException.USER_MESSAGE
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
        StoredUploadMetadata upload = findStoredUploadMetadata(session.getId());
        if (upload == null
                && session.getStatus() != UploadStatus.DUPLICATE
                && session.getStatus() != UploadStatus.CANCELLED) {
            upload = getStoredUploadMetadata(session.getId());
        }
        return new UploadStatusResponse(
                session.getId(),
                upload == null ? null : upload.id(),
                session.getOriginalFileName(),
                session.getStatus(),
                session.getExpectedFileSizeBytes(),
                session.getUploadedBytes(),
                session.getUploadedParts(),
                session.getExpectedTotalParts(),
                session.getProcessedRows(),
                session.getDuplicateRows(),
                session.getErrorMessage(),
                upload == null ? session.getCreatedAt() : upload.uploadedAt()
        );
    }

    private UploadSummaryResponse toSummaryResponse(UploadSummaryProjection projection) {
        return new UploadSummaryResponse(
                projection.getId(),
                projection.getSessionId(),
                projection.getFileName(),
                projection.getSourceName(),
                projection.getUploadedAt(),
                projection.getImportStatus(),
                projection.getWasEvaluated(),
                projection.getTransactionCount() > 0
                        && projection.getNewTransactionCount() == 0
                        ? "EVALUATED"
                        : "NOT_EVALUATED",
                projection.getTransactionCount(),
                projection.getDuplicateRows()
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
        StoredUploadMetadata upload = findStoredUploadMetadata(sessionId);
        if (upload == null) {
            throw new UploadException(
                    HttpStatus.NOT_FOUND,
                    "UPLOAD_DOCUMENT_NOT_FOUND",
                    "Stored upload document not found."
            );
        }
        return upload;
    }

    private void finishUploadAfterCommit(UUID uploadId) {
        runAfterCommit(() -> uploadTimeLogger.finish(uploadId));
    }

    private void runAfterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        action.run();
                    }
                }
        );
    }

    private StoredUploadMetadata findStoredUploadMetadata(UUID sessionId) {
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
            return null;
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

    private record SortOptions(String field, String direction) {
    }

    private void assertUploadOwnedBy(UUID uploadId, UUID userId) {
        Boolean owned = jdbcTemplate.queryForObject(
                """
                        SELECT EXISTS (
                            SELECT 1
                            FROM upload_sessions session
                            LEFT JOIN uploads upload ON upload.session_id = session.id
                            WHERE session.id = ?
                              AND COALESCE(upload.user_id, session.user_id) = ?
                        )
                        """,
                Boolean.class,
                uploadId,
                userId
        );
        if (!Boolean.TRUE.equals(owned)) {
            throw new UploadException(
                    HttpStatus.NOT_FOUND,
                    "UPLOAD_NOT_FOUND",
                    "Upload session not found."
            );
        }
    }
}
