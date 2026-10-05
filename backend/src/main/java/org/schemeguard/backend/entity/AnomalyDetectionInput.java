package org.schemeguard.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.util.UUID;

/** Cache identity stored separately so existing tables need no schema changes. */
@Entity
@Table(name = "anomaly_detection_inputs")
@Getter @Setter @NoArgsConstructor
public class AnomalyDetectionInput {
    @Id
    @Column(name = "job_id")
    private UUID jobId;
    @Column(nullable = false, length = 100)
    private String fingerprint;
}
