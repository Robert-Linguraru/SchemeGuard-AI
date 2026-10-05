package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.AnomalyDetectionJob;
import org.schemeguard.backend.entity.enums.AnomalyJobStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface AnomalyDetectionJobRepository extends JpaRepository<AnomalyDetectionJob, UUID> {
    Optional<AnomalyDetectionJob> findByUpload_Id(UUID uploadId);
    Optional<AnomalyDetectionJob> findFirstByStatusOrderByRequestedAt(AnomalyJobStatus status);

    @org.springframework.data.jpa.repository.Query(value = """
            SELECT * FROM anomaly_detection_jobs
            WHERE status = 'PENDING' OR (status = 'RUNNING' AND updated_at < :staleBefore)
            ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    Optional<AnomalyDetectionJob> lockNextJob(
            @org.springframework.data.repository.query.Param("staleBefore") java.time.Instant staleBefore);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select j from AnomalyDetectionJob j where j.id = :id")
    Optional<AnomalyDetectionJob> lockById(@org.springframework.data.repository.query.Param("id") UUID id);
}
