package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.TransactionOutlier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TransactionOutlierRepository extends JpaRepository<TransactionOutlier, UUID> {

    List<TransactionOutlier> findAllByUploadId(UUID uploadId);

    Optional<TransactionOutlier> findByUploadIdAndTransactionId(UUID uploadId, UUID transactionId);

    void deleteAllByUploadId(UUID uploadId);
}
