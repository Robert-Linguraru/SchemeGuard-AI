package org.schemeguard.backend.repository.csvuploads;

import org.schemeguard.backend.entity.csvuploads.TransactionSource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TransactionSourceRepository extends JpaRepository<TransactionSource, UUID> {

    List<TransactionSource> findAllByOrderByNormalizedNameAsc();
}
