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

        long countByUpload_IdAndStatus(UUID uploadId, TransactionStatus status);

    @Query("select t from Transaction t join fetch t.merchant join fetch t.scheme")
    List<Transaction> findAllWithMerchantAndScheme();

}
