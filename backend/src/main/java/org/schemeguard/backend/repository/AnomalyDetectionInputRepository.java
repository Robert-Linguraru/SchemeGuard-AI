package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.AnomalyDetectionInput;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface AnomalyDetectionInputRepository extends JpaRepository<AnomalyDetectionInput, UUID> {}
