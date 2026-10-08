package org.schemeguard.backend.service.csvuploads.csvUploadTimeLogger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** Best-effort timing persistence for the existing CSV upload lifecycle. */
@Component
public class UploadTimeLogger {

    private static final Logger log = LoggerFactory.getLogger(UploadTimeLogger.class);

    private final JdbcTemplate jdbcTemplate;

    public UploadTimeLogger(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void recordPartRequest(UUID uploadId, Instant startedAt, long elapsedNanos) {
        long elapsedMs = toMillis(elapsedNanos);
        bestEffort("part request", () -> jdbcTemplate.update(
                """
                        UPDATE upload_sessions
                        SET first_part_request_at = COALESCE(first_part_request_at, ?),
                            part_request_processing_duration_ms =
                                COALESCE(part_request_processing_duration_ms, 0) + ?,
                            all_parts_received_at = CASE
                                WHEN uploaded_parts >= expected_total_parts
                                THEN COALESCE(all_parts_received_at, clock_timestamp())
                                ELSE all_parts_received_at
                            END,
                            receive_duration_ms = CASE
                                WHEN uploaded_parts >= expected_total_parts
                                     AND all_parts_received_at IS NULL
                                THEN GREATEST(
                                    0,
                                    FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - created_at)) * 1000)::BIGINT
                                )
                                ELSE receive_duration_ms
                            END
                        WHERE id = ?
                        """,
                Timestamp.from(startedAt),
                elapsedMs,
                uploadId
        ));
    }

    public void markProcessingStarted(UUID uploadId) {
        bestEffort("processing start", () -> jdbcTemplate.update(
                """
                        UPDATE upload_sessions
                        SET processing_started_at = COALESCE(
                            processing_started_at,
                            clock_timestamp()
                        )
                        WHERE id = ?
                        """,
                uploadId
        ));
    }

    public void recordDocumentPersistence(UUID uploadId, long elapsedNanos) {
        bestEffort("document persistence", () -> jdbcTemplate.update(
                """
                        UPDATE upload_sessions
                        SET document_persistence_duration_ms =
                            COALESCE(document_persistence_duration_ms, 0) + ?
                        WHERE id = ?
                        """,
                toMillis(elapsedNanos),
                uploadId
        ));
    }

    public CsvStageTimer newCsvStageTimer() {
        return new CsvStageTimer();
    }

    public void measureStagingWrite(CsvStageTimer timer, Runnable operation) {
        long startedAt = System.nanoTime();
        try {
            operation.run();
        } finally {
            timer.addStagingNanos(System.nanoTime() - startedAt);
        }
    }

    /** Records total CSV parse/row validation time and the separately timed staging writes. */
    public void recordCsvProcessing(
            UUID uploadId,
            long elapsedNanos,
            CsvStageTimer timer
    ) {
        long totalMs = toMillis(elapsedNanos);
        long stagingMs = Math.min(totalMs, toMillis(timer.stagingNanos()));
        long parseAndValidationMs = Math.max(0, totalMs - stagingMs);
        bestEffort("CSV processing", () -> jdbcTemplate.update(
                """
                        UPDATE upload_sessions
                        SET csv_parse_validation_duration_ms =
                                COALESCE(csv_parse_validation_duration_ms, 0) + ?,
                            staging_write_duration_ms =
                                COALESCE(staging_write_duration_ms, 0) + ?
                        WHERE id = ?
                        """,
                parseAndValidationMs,
                stagingMs,
                uploadId
        ));
    }

    public void recordFinalMerge(UUID uploadId, long elapsedNanos) {
        bestEffort("final database merge", () -> jdbcTemplate.update(
                """
                        UPDATE upload_sessions
                        SET final_merge_duration_ms = COALESCE(final_merge_duration_ms, ?)
                        WHERE id = ?
                        """,
                toMillis(elapsedNanos),
                uploadId
        ));
    }

    /** Stores the end-to-end server duration on both the session and its upload record. */
    public void finish(UUID uploadId) {
        bestEffort("upload completion", () -> {
            jdbcTemplate.update(
                    """
                            UPDATE upload_sessions
                            SET finished_at = COALESCE(finished_at, clock_timestamp()),
                                total_duration_ms = COALESCE(
                                    total_duration_ms,
                                    GREATEST(
                                        0,
                                        FLOOR(EXTRACT(EPOCH FROM (
                                            clock_timestamp() - created_at
                                        )) * 1000)::BIGINT
                                    )
                                )
                            WHERE id = ?
                            """,
                    uploadId
            );
            jdbcTemplate.update(
                    """
                            UPDATE uploads
                            SET total_duration_ms = (
                                SELECT total_duration_ms
                                FROM upload_sessions
                                WHERE id = ?
                            )
                            WHERE session_id = ?
                            """,
                    uploadId,
                    uploadId
            );
        });
    }

    private void bestEffort(String operation, Runnable write) {
        try {
            write.run();
        } catch (RuntimeException exception) {
            // Timing is diagnostic only and must never change upload outcomes.
            log.warn("Could not record CSV upload timing for {}", operation, exception);
        }
    }

    private static long toMillis(long nanos) {
        return Math.max(0, TimeUnit.NANOSECONDS.toMillis(nanos));
    }

    public static final class CsvStageTimer {
        private long stagingNanos;

        private void addStagingNanos(long nanos) {
            stagingNanos += Math.max(0, nanos);
        }

        private long stagingNanos() {
            return stagingNanos;
        }
    }
}
