package org.schemeguard.backend.service.csvUpload;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.schemeguard.backend.config.UploadProperties;
import org.schemeguard.backend.entity.UploadPart;
import org.schemeguard.backend.entity.UploadSession;
import org.schemeguard.backend.entity.enums.UploadStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.AsyncResult;
import org.springframework.stereotype.Service;
import org.schemeguard.backend.repository.UploadRepository;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

@Service
public class CsvImportService {

    private static final Set<String> REQUIRED_HEADERS = Set.of(
            "transaction_id", "network", "amount", "currency", "merchant_country",
            "merchant_id", "merchant_name", "mcc", "card_country", "card_type",
            "card_product", "is_commercial_card", "channel", "entry_mode",
            "authentication", "authorization_timestamp", "clearing_timestamp",
            "authorization_code", "settlement_status", "merchant_data_complete",
            "recurring", "refund"
    );

    private final UploadService uploadService;
    private final StorageService storageService;
    private final TransactionBatchWriter batchWriter;
    private final UploadDocumentWriter documentWriter;
    private final UploadRepository uploadRepository;
    private final UploadProperties uploadProperties;

    public CsvImportService(
            UploadService uploadService,
            StorageService storageService,
            TransactionBatchWriter batchWriter,
            UploadDocumentWriter documentWriter,
            UploadRepository uploadRepository,
            UploadProperties uploadProperties
    ) {
        this.uploadService = uploadService;
        this.storageService = storageService;
        this.batchWriter = batchWriter;
        this.documentWriter = documentWriter;
        this.uploadRepository = uploadRepository;
        this.uploadProperties = uploadProperties;
    }

    @Async("csvImportExecutor")
    public Future<Void> importAsync(UUID uploadId) {
        long processedRows = 0;
        try {
            UploadSession session = uploadService.getSession(uploadId);
            if (session.getStatus() != UploadStatus.QUEUED) {
                return new AsyncResult<>(null);
            }

            if (!uploadService.markProcessing(uploadId)) {
                return new AsyncResult<>(null);
            }

            List<UploadPart> parts = uploadService.getParts(uploadId);
            UUID uploadRecordId = uploadRepository
                    .findUploadIdBySessionId(uploadId)
                    .orElseThrow(() -> new IllegalStateException("Stored upload not found."));
            documentWriter.write(
                    uploadRecordId,
                    parts,
                    session.getExpectedFileSizeBytes(),
                    session.getExpectedFileSha256()
            );

            processedRows = importCsv(uploadId, uploadRecordId, parts);
            uploadService.markCompleted(uploadId, processedRows);
            try {
                storageService.deleteUpload(uploadId);
            } catch (RuntimeException ignored) {
                // Import is complete even if temporary-file cleanup needs a retry.
            }
        } catch (Exception exception) {
            uploadService.markFailed(
                    uploadId,
                    rootMessage(exception),
                    processedRows
            );
        }
        return new AsyncResult<>(null);
    }

    private long importCsv(
            UUID sessionId,
            UUID uploadRecordId,
            List<UploadPart> parts
    ) throws IOException {
        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setHeader()
                .setSkipHeaderRecord(true)
                .setIgnoreEmptyLines(true)
                .setTrim(true)
                .get();

        long processedRows = 0;
        int batchSize = uploadProperties.getImportBatchSize();
        long progressUpdateIntervalNanos = TimeUnit.MILLISECONDS.toNanos(
                Math.max(1, uploadProperties.getProgressUpdateIntervalMs())
        );
        List<TransactionRow> batch = new ArrayList<>(batchSize);
        long lastProgressUpdateRows = 0;
        long lastProgressUpdateNanos = System.nanoTime();
        try (InputStream input = storageService.openConcatenatedStream(parts);
             BufferedReader reader = new BufferedReader(
                     new InputStreamReader(input, StandardCharsets.UTF_8)
             );
             CSVParser parser = format.parse(reader)) {
            validateHeaders(parser.getHeaderNames());
            for (CSVRecord record : parser) {
                if (!record.isConsistent()) {
                    throw new IllegalArgumentException(
                            "CSV row " + record.getRecordNumber()
                                    + " has an unexpected number of columns"
                    );
                }
                batch.add(TransactionRow.from(record, record.getRecordNumber() + 1));
                if (batch.size() == batchSize) {
                    batchWriter.write(uploadRecordId, batch);
                    processedRows += batch.size();
                    if (System.nanoTime() - lastProgressUpdateNanos >= progressUpdateIntervalNanos) {
                        uploadService.updateProcessedRows(sessionId, processedRows);
                        lastProgressUpdateRows = processedRows;
                        lastProgressUpdateNanos = System.nanoTime();
                    }
                    batch.clear();
                }
            }
            if (!batch.isEmpty()) {
                batchWriter.write(uploadRecordId, batch);
                processedRows += batch.size();
            }
            if (processedRows != lastProgressUpdateRows) {
                uploadService.updateProcessedRows(sessionId, processedRows);
            }
        }
        return processedRows;
    }

    private void validateHeaders(List<String> headers) {
        Set<String> normalized = new HashSet<>();
        for (String header : headers) {
            normalized.add(header.trim());
        }
        if (!normalized.containsAll(REQUIRED_HEADERS)) {
            Set<String> missing = new HashSet<>(REQUIRED_HEADERS);
            missing.removeAll(normalized);
            throw new IllegalArgumentException(
                    "CSV is missing required columns: " + missing
            );
        }
    }

    private static String rootMessage(Exception exception) {
        Throwable current = exception;
        while (current.getCause() != null
                && (current.getMessage() == null || current.getMessage().isBlank())) {
            current = current.getCause();
        }
        return current.getMessage() == null
                ? "Import failed."
                : current.getMessage();
    }
}
