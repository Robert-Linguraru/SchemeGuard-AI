package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.Upload;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

public interface UploadRepository extends JpaRepository<Upload, UUID> {

    @Query(value = """
        SELECT u.id AS id,
           s.original_file_name AS fileName,
           u.uploaded_at AS uploadedAt,
           s.status AS importStatus,
               u.was_evaluated AS wasEvaluated,
                   COUNT(t.id) AS transactionCount,
                   COALESCE(SUM(CASE WHEN t.status = 'NEW' THEN 1 ELSE 0 END), 0) AS newTransactionCount
        FROM uploads u
        JOIN upload_sessions s ON s.id = u.session_id
        LEFT JOIN transactions t ON t.upload_id = u.id
                WHERE u.user_id = :userId
                    AND (
                            :search IS NULL
                            OR BTRIM(:search) = ''
                            OR LOWER(s.original_file_name) LIKE LOWER(CONCAT('%', BTRIM(:search), '%'))
                    )
        GROUP BY u.id, s.original_file_name, u.uploaded_at, s.status, u.was_evaluated
        ORDER BY u.uploaded_at DESC, u.id DESC
        """,
        countQuery = """
            SELECT COUNT(u.id)
                        FROM uploads u
                        JOIN upload_sessions s ON s.id = u.session_id
                        WHERE u.user_id = :userId
                            AND (
                                    :search IS NULL
                                    OR BTRIM(:search) = ''
                                    OR LOWER(s.original_file_name) LIKE LOWER(CONCAT('%', BTRIM(:search), '%'))
                            )
            """,
        nativeQuery = true)
    Page<UploadSummaryProjection> findSummariesByUserId(
        @Param("userId") UUID userId,
            @Param("search") String search,
        Pageable pageable
    );

    Optional<Upload> findBySession_Id(UUID sessionId);

    Optional<Upload> findByIdAndUser_Id(UUID uploadId, UUID userId);

        @Query(value = """
                        WITH latest_results AS (
                                SELECT DISTINCT ON (qr.transaction_id)
                                             qr.transaction_id,
                                             qr.id AS result_id,
                                             qr.qualification_status
                                FROM qualification_results qr
                                JOIN transactions tx ON tx.id = qr.transaction_id
                                WHERE tx.upload_id = :uploadId
                                    AND qr.active = TRUE
                                ORDER BY qr.transaction_id, qr.evaluated_at DESC, qr.id DESC
                        )
                             SELECT COUNT(tx.id) AS "totalTransactions",
                                 COUNT(*) FILTER (WHERE tx.status = 'PROCESSED') AS "processedTransactions",
                                 COUNT(*) FILTER (WHERE tx.status = 'NEW') AS "pendingTransactions",
                                 COUNT(*) FILTER (WHERE lr.qualification_status = 'QUALIFIED') AS "qualifiedTransactions",
                                 COUNT(*) FILTER (WHERE lr.qualification_status = 'PARTIALLY_QUALIFIED') AS "partiallyQualifiedTransactions",
                                 COUNT(*) FILTER (WHERE lr.qualification_status = 'NOT_QUALIFIED') AS "notQualifiedTransactions",
                                 COALESCE(SUM(tx.amount), 0) AS "totalAmount",
                                 COALESCE(SUM(fc.total_fee), 0) AS "totalFees"
                        FROM uploads u
                        LEFT JOIN transactions tx ON tx.upload_id = u.id
                        LEFT JOIN latest_results lr ON lr.transaction_id = tx.id
                        LEFT JOIN fee_calculations fc
                                ON fc.qualification_result_id = lr.result_id
                             AND fc.active = TRUE
                        WHERE u.id = :uploadId
                            AND u.user_id = :userId
                        """, nativeQuery = true)
        Optional<UploadStatisticsProjection> findStatisticsByIdAndUserId(
                        @Param("uploadId") UUID uploadId,
                        @Param("userId") UUID userId
        );

    boolean existsByIdAndUser_Id(UUID uploadId, UUID userId);

    @Query("select u.id from Upload u where u.session.id = :sessionId")
    Optional<UUID> findUploadIdBySessionId(@Param("sessionId") UUID sessionId);

    @Modifying
    @Transactional
    @Query(value = """
            UPDATE uploads
            SET was_evaluated = TRUE
            WHERE id = :fileId
              AND NOT EXISTS (
                  SELECT 1
                  FROM transactions
                  WHERE upload_id = :fileId
                    AND status = 'NEW'
              )
            """, nativeQuery = true)
    int markEvaluatedIfComplete(@Param("fileId") UUID fileId);
}
