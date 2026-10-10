package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.TransactionOutlierExplanation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface TransactionOutlierExplanationRepository extends JpaRepository<TransactionOutlierExplanation, UUID> {}
