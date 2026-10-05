package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.AnomalyDetectionJob;
import org.schemeguard.backend.entity.enums.AnomalyJobStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface AnomalyDetectionJobRepository extends JpaRepository<AnomalyDetectionJob, UUID> {
    Optional<AnomalyDetectionJob> findByUpload_Id(UUID uploadId);
    Optional<AnomalyDetectionJob> findFirstByStatusOrderByRequestedAt(AnomalyJobStatus status);
}
