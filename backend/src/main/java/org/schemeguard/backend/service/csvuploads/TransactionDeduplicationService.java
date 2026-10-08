package org.schemeguard.backend.service.csvuploads;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class TransactionDeduplicationService {

    private static final String MARK_DUPLICATES_SQL_TEMPLATE = """
            WITH upload_context AS (
                SELECT user_id, source_id
                FROM uploads
                WHERE id = ?
            ),
            prior_transactions AS (
                SELECT DISTINCT ON (t.external_id)
                    t.external_id,
                    t.id AS transaction_id,
                    t.upload_id
                FROM transactions t
                CROSS JOIN upload_context context
                WHERE t.user_id = context.user_id
                  AND t.source_id = context.source_id
                  AND EXISTS (
                      SELECT 1
                      FROM __CANDIDATE_TABLE__ candidate
                      WHERE candidate.upload_id = ?
                        AND candidate.external_id = t.external_id
                  )
                ORDER BY t.external_id, t.created_at, t.id
            ),
            numbered_rows AS (
                SELECT
                    candidate.row_number,
                    candidate.external_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY candidate.external_id
                        ORDER BY candidate.row_number
                    ) AS occurrence,
                    prior.transaction_id,
                    prior.upload_id AS duplicate_upload_id
                FROM __CANDIDATE_TABLE__ candidate
                LEFT JOIN prior_transactions prior
                    ON prior.external_id = candidate.external_id
                WHERE candidate.upload_id = ?
            )
            UPDATE __CANDIDATE_TABLE__ candidate
            SET is_duplicate = (
                    numbered.transaction_id IS NOT NULL OR numbered.occurrence > 1
                ),
                duplicate_reason = CASE
                    WHEN numbered.transaction_id IS NOT NULL THEN 'PREVIOUS_UPLOAD'
                    WHEN numbered.occurrence > 1 THEN 'REPEATED_IN_UPLOAD'
                    ELSE NULL
                END,
                duplicate_transaction_id = numbered.transaction_id,
                duplicate_upload_id = numbered.duplicate_upload_id
            FROM numbered_rows numbered
            WHERE candidate.upload_id = ?
              AND candidate.row_number = numbered.row_number
            """;

    private static final String DUPLICATE_SUMMARY_SQL_TEMPLATE = """
            SELECT
                COUNT(*) AS duplicate_count,
                MD5(COALESCE(
                    STRING_AGG(
                        row_number::text || ':' || duplicate_reason || ':' ||
                            COALESCE(duplicate_transaction_id::text, ''),
                        ',' ORDER BY row_number
                    ),
                    ''
                )) AS duplicate_signature
            FROM __CANDIDATE_TABLE__
            WHERE upload_id = ? AND is_duplicate = TRUE
            """;

    private final JdbcTemplate jdbcTemplate;

    public TransactionDeduplicationService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public DuplicateSummary refreshStagedDuplicateMarks(UUID uploadRecordId) {
        return refreshDuplicateMarks(uploadRecordId, CandidateStore.STAGING);
    }

    @Transactional
    public DuplicateSummary refreshReviewDuplicateMarks(UUID uploadRecordId) {
        return refreshDuplicateMarks(uploadRecordId, CandidateStore.REVIEW);
    }

    private DuplicateSummary refreshDuplicateMarks(UUID uploadRecordId, CandidateStore store) {
        jdbcTemplate.update(
                MARK_DUPLICATES_SQL_TEMPLATE.replace("__CANDIDATE_TABLE__", store.tableName),
                uploadRecordId,
                uploadRecordId,
                uploadRecordId,
                uploadRecordId
        );
        return jdbcTemplate.queryForObject(
                DUPLICATE_SUMMARY_SQL_TEMPLATE.replace("__CANDIDATE_TABLE__", store.tableName),
                (resultSet, rowNumber) -> new DuplicateSummary(
                        resultSet.getLong("duplicate_count"),
                        resultSet.getString("duplicate_signature")
                ),
                uploadRecordId
        );
    }

    /** Serializes decisions for one analyst and transaction source. */
    @Transactional
    public void lockSource(UUID uploadRecordId) {
        UploadIdentity identity = jdbcTemplate.queryForObject(
                """
                        SELECT user_id, source_id
                        FROM uploads
                        WHERE id = ?
                        """,
                (resultSet, rowNumber) -> new UploadIdentity(
                        resultSet.getObject("user_id", UUID.class),
                        resultSet.getObject("source_id", UUID.class)
                ),
                uploadRecordId
        );
        if (identity == null || identity.userId() == null || identity.sourceId() == null) {
            throw new IllegalStateException("Upload is missing its owner or transaction source.");
        }

        String lockKey = identity.userId() + ":" + identity.sourceId();
        jdbcTemplate.query(
                "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                resultSet -> { },
                lockKey
        );
    }

    public record DuplicateSummary(long count, String signature) { }

    private record UploadIdentity(UUID userId, UUID sourceId) { }

    private enum CandidateStore {
        STAGING("transaction_import_staging"),
        REVIEW("transaction_import_review");

        private final String tableName;

        CandidateStore(String tableName) {
            this.tableName = tableName;
        }
    }
}
