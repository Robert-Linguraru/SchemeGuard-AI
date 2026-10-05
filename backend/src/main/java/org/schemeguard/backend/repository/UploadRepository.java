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
import java.util.List;
import java.util.UUID;

public interface UploadRepository extends JpaRepository<Upload, UUID> {

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from Upload u where u.id = :uploadId and u.user.id = :userId")
    Optional<Upload> lockForAnomalyDetection(@Param("uploadId") UUID uploadId, @Param("userId") UUID userId);

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
                                 COALESCE(SUM(tx.amount), 0) AS "totalAmount"
                        FROM uploads u
                        LEFT JOIN transactions tx ON tx.upload_id = u.id
                        LEFT JOIN latest_results lr ON lr.transaction_id = tx.id
                        WHERE u.id = :uploadId
                            AND u.user_id = :userId
                        GROUP BY u.id
                        """, nativeQuery = true)
        Optional<UploadStatisticsProjection> findStatisticsByIdAndUserId(
                        @Param("uploadId") UUID uploadId,
                        @Param("userId") UUID userId
        );

    @Query(value = """
            WITH latest_results AS (
                SELECT DISTINCT ON (qr.transaction_id) qr.transaction_id, qr.id
                FROM qualification_results qr
                JOIN transactions t ON t.id = qr.transaction_id
                JOIN uploads u ON u.id = t.upload_id
                WHERE u.id = :uploadId AND u.user_id = :userId AND qr.active = TRUE
                ORDER BY qr.transaction_id, qr.evaluated_at DESC, qr.id DESC
            )
            SELECT t.currency_code AS currency, fc.total_fee AS fee, COUNT(*) AS "transactionCount"
            FROM latest_results qr
            JOIN transactions t ON t.id = qr.transaction_id
            JOIN fee_calculations fc ON fc.qualification_result_id = qr.id AND fc.active = TRUE
            GROUP BY t.currency_code, fc.total_fee
            """, nativeQuery = true)
    List<UploadFeeProjection> findFeeGroupsByIdAndUserId(
            @Param("uploadId") UUID uploadId, @Param("userId") UUID userId);

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
