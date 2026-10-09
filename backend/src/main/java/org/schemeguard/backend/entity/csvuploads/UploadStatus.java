package org.schemeguard.backend.entity.csvuploads;

public enum UploadStatus {
    UPLOADING,
    QUEUED,
    PROCESSING,
    DUPLICATES_FOUND,
    COMPLETED,
    DUPLICATE,
    FAILED,
    CANCELLED
}
