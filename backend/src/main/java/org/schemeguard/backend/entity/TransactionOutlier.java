package org.schemeguard.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.schemeguard.backend.entity.csvuploads.Upload;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(
        name = "transaction_outliers",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_transaction_outlier_upload_transaction",
                columnNames = {"upload_id", "transaction_id"}
        ),
        indexes = {
                @Index(name = "idx_transaction_outliers_upload_id", columnList = "upload_id")
        }
)
public class TransactionOutlier {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "upload_id", nullable = false)
    private Upload upload;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "transaction_id", nullable = false)
    private Transaction transaction;

    @Column(name = "manually_confirmed", nullable = false)
    private boolean manuallyConfirmed = false;

    @Column(name = "detected_at", nullable = false)
    private Instant detectedAt;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @PrePersist
    protected void onCreate() {
        if (detectedAt == null) {
            detectedAt = Instant.now();
        }
    }
}
