package org.schemeguard.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.schemeguard.backend.entity.csvuploads.Upload;
import org.schemeguard.backend.entity.enums.AnomalyJobStatus;
import java.time.Instant;
import java.util.UUID;

@Getter @Setter @NoArgsConstructor
@Entity
@Table(name = "anomaly_detection_jobs")
public class AnomalyDetectionJob {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "upload_id", nullable = false, unique = true)
    private Upload upload;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AnomalyJobStatus status = AnomalyJobStatus.PENDING;
    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt = Instant.now();
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
    @Column(name = "error_message", length = 1000)
    private String errorMessage;
}
