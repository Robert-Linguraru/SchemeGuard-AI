package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.Transaction;
import org.schemeguard.backend.entity.enums.TransactionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface TransactionRepository extends JpaRepository<Transaction, UUID> {

    @EntityGraph(attributePaths = {"merchant", "scheme"})
    Page<Transaction> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);

    @EntityGraph(attributePaths = {"merchant", "scheme"})
    Page<Transaction> findAllByUpload_IdOrderByCreatedAtDescIdDesc(
            UUID uploadId,
            Pageable pageable
    );

    @Query(value = """
            SELECT t FROM Transaction t
            JOIN FETCH t.merchant
            JOIN FETCH t.scheme
            WHERE t.upload.id = :uploadId
              AND (
                    :search IS NULL OR :search = ''
                    OR LOWER(t.externalId) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(t.merchant.name) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(t.scheme.code) LIKE LOWER(CONCAT('%', :search, '%'))
                  )
              AND (
                    :anomaliesOnly = FALSE
                    OR EXISTS (
                        SELECT outlier.id FROM TransactionOutlier outlier
                        WHERE outlier.transaction.id = t.id
                          AND outlier.upload.id = :uploadId
                    )
                  )
            """,
            countQuery = """
            SELECT COUNT(t) FROM Transaction t
            WHERE t.upload.id = :uploadId
              AND (
                    :search IS NULL OR :search = ''
                    OR LOWER(t.externalId) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(t.merchant.name) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(t.scheme.code) LIKE LOWER(CONCAT('%', :search, '%'))
                  )
              AND (
                    :anomaliesOnly = FALSE
                    OR EXISTS (
                        SELECT outlier.id FROM TransactionOutlier outlier
                        WHERE outlier.transaction.id = t.id
                          AND outlier.upload.id = :uploadId
                    )
                  )
            """)
    Page<Transaction> findUploadTransactions(
            @Param("uploadId") UUID uploadId,
            @Param("search") String search,
            @Param("anomaliesOnly") boolean anomaliesOnly,
            Pageable pageable
    );

    @Query(value = """
            SELECT t FROM Transaction t
            JOIN FETCH t.merchant
            JOIN FETCH t.scheme
            WHERE t.upload.id = :uploadId
              AND (
                    :search IS NULL OR :search = ''
                    OR LOWER(t.externalId) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(t.merchant.name) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(t.scheme.code) LIKE LOWER(CONCAT('%', :search, '%'))
                  )
              AND (
                    :anomaliesOnly = FALSE
                    OR EXISTS (
                        SELECT outlier.id FROM TransactionOutlier outlier
                        WHERE outlier.transaction.id = t.id
                          AND outlier.upload.id = :uploadId
                    )
                  )
            ORDER BY CASE WHEN EXISTS (
                SELECT outlier.id FROM TransactionOutlier outlier
                WHERE outlier.transaction.id = t.id
                  AND outlier.upload.id = :uploadId
            ) THEN 0 ELSE 1 END, t.createdAt DESC, t.id DESC
            """,
            countQuery = """
            SELECT COUNT(t) FROM Transaction t
            WHERE t.upload.id = :uploadId
              AND (
                    :search IS NULL OR :search = ''
                    OR LOWER(t.externalId) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(t.merchant.name) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(t.scheme.code) LIKE LOWER(CONCAT('%', :search, '%'))
                  )
              AND (
                    :anomaliesOnly = FALSE
                    OR EXISTS (
                        SELECT outlier.id FROM TransactionOutlier outlier
                        WHERE outlier.transaction.id = t.id
                          AND outlier.upload.id = :uploadId
                    )
                  )
            """)
    Page<Transaction> findUploadTransactionsAnomaliesFirst(
            @Param("uploadId") UUID uploadId,
            @Param("search") String search,
            @Param("anomaliesOnly") boolean anomaliesOnly,
            Pageable pageable
    );

    @Query("select coalesce(sum(transaction.amount), 0) from Transaction transaction")
    BigDecimal sumAmount();

    @Query(value = """
            SELECT * FROM transactions WHERE status = 'NEW' AND created_at <= :cutoff AND upload_id = :fileId
            ORDER BY created_at, id LIMIT :batchSize FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<Transaction> lockUnevaluated(@Param("cutoff") Instant cutoff,
                                      @Param("batchSize") int batchSize,
                                      @Param("fileId") UUID fileId);

    List<Transaction> findAllByUpload_IdAndExternalId(UUID uploadId, String externalId);

    @Query(value = """
            SELECT DISTINCT ON (t.id)
                   t.id AS id,
                   t.external_id AS externalId,
                   cs.code AS scheme,
                   t.amount AS amount,
                   t.currency_code AS currency,
                   t.card_type AS cardType,
                   t.card_category AS cardCategory,
                   t.channel AS channel,
                   t.issuer_country AS issuerCountry,
                   t.merchant_country AS merchantCountry,
                   t.three_ds_used AS threeDsUsed,
                   t.cvv_present AS cvvPresent,
                   COALESCE((t.raw_data ->> 'merchant_data_complete')::boolean, TRUE)
                       AS merchantDataComplete,
                   EXTRACT(EPOCH FROM (t.cleared_at - t.authorized_at)) / 86400.0
                       AS clearingDelayDays,
                   qr.qualification_status AS qualificationStatus,
                   qr.qualification_category AS qualificationCategory,
                   r.rule_code AS ruleCode,
                   fc.interchange_rate AS interchangeRate
            FROM transactions t
            JOIN card_schemes cs ON cs.id = t.scheme_id
            JOIN qualification_results qr ON qr.transaction_id = t.id
            LEFT JOIN interchange_rules r ON r.id = qr.rule_id
            JOIN fee_calculations fc ON fc.qualification_result_id = qr.id
            WHERE t.upload_id = :uploadId
            ORDER BY t.id, qr.evaluated_at DESC, qr.id DESC
            """, nativeQuery = true)
    List<MlTransactionProjection> findMlTransactionsForUpload(@Param("uploadId") UUID uploadId);

        boolean existsByIdAndUpload_Id(UUID transactionId, UUID uploadId);

        long countByUpload_IdAndStatus(UUID uploadId, TransactionStatus status);

    @Query("select t from Transaction t join fetch t.merchant join fetch t.scheme")
    List<Transaction> findAllWithMerchantAndScheme();

    @Query(value = """
            select t.id as id, m.name as merchantName, cs.code as schemeCode,
                   t.amount as amount, t.merchant_country as merchantCountry,
                   t.authorized_at as authorizedAt, t.status as status
            from transactions t
            join merchants m on m.id = t.merchant_id
            join card_schemes cs on cs.id = t.scheme_id
            """, nativeQuery = true)
    List<AnalyticsTransactionProjection> findAllForAnalytics();
}
