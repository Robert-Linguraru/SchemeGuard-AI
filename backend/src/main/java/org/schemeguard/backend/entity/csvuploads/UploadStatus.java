package org.schemeguard.backend.entity.csvuploads;

public enum UploadStatus {
    UPLOADING,
    QUEUED,
    PROCESSING,
    COMPLETED,
    DUPLICATE,
    FAILED,
    CANCELLED
}
