package org.schemeguard.backend.entity.csvuploads;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "upload_sessions")
public class UploadSession {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(name = "processing_job_id")
    private UUID processingJobId;

    @Column(name = "original_file_name", nullable = false, length = 255)
    private String originalFileName;

    @Column(name = "expected_file_size_bytes", nullable = false)
    private long expectedFileSizeBytes;

    @Column(name = "expected_total_parts", nullable = false)
    private int expectedTotalParts;

    @Column(name = "expected_file_sha256", length = 64)
    private String expectedFileSha256;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UploadStatus status;

    @Column(name = "uploaded_bytes", nullable = false)
    private long uploadedBytes;

    @Column(name = "uploaded_parts", nullable = false)
    private int uploadedParts;

    @Column(name = "processed_rows", nullable = false)
    private long processedRows;

    @Column(name = "error_message", length = 1000)
    private String errorMessage;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private long version;

    @OneToOne(mappedBy = "session", fetch = FetchType.LAZY)
    private Upload upload;

    protected UploadSession() {
    }

    public UploadSession(
            UUID id,
            String originalFileName,
            long expectedFileSizeBytes,
            int expectedTotalParts,
            String expectedFileSha256
    ) {
        this.id = id;
        this.originalFileName = originalFileName;
        this.expectedFileSizeBytes = expectedFileSizeBytes;
        this.expectedTotalParts = expectedTotalParts;
        this.expectedFileSha256 = expectedFileSha256;
        this.status = UploadStatus.UPLOADING;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public UUID getProcessingJobId() {
        return processingJobId;
    }

    public void setProcessingJobId(UUID processingJobId) {
        this.processingJobId = processingJobId;
    }

    public String getOriginalFileName() {
        return originalFileName;
    }

    public long getExpectedFileSizeBytes() {
        return expectedFileSizeBytes;
    }

    public int getExpectedTotalParts() {
        return expectedTotalParts;
    }

    public String getExpectedFileSha256() {
        return expectedFileSha256;
    }

    public UploadStatus getStatus() {
        return status;
    }

    public void setStatus(UploadStatus status) {
        this.status = status;
    }

    public long getUploadedBytes() {
        return uploadedBytes;
    }

    public void addUploadedBytes(long bytes) {
        this.uploadedBytes += bytes;
    }

    public int getUploadedParts() {
        return uploadedParts;
    }

    public void incrementUploadedParts() {
        this.uploadedParts++;
    }

    public long getProcessedRows() {
        return processedRows;
    }

    public void setProcessedRows(long processedRows) {
        this.processedRows = processedRows;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }
}
