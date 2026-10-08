package org.schemeguard.backend.entity.csvuploads;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "transaction_sources")
@Getter
@Setter
@NoArgsConstructor
public class TransactionSource {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(name = "normalized_name", nullable = false, unique = true, length = 255)
    private String normalizedName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public TransactionSource(UUID id, String name, String normalizedName) {
        this.id = id;
        this.name = name;
        this.normalizedName = normalizedName;
        this.createdAt = Instant.now();
    }
}
