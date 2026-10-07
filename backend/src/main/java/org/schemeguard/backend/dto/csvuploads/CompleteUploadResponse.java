package org.schemeguard.backend.dto.csvuploads;

import org.schemeguard.backend.entity.csvuploads.UploadStatus;

import java.util.UUID;

public record CompleteUploadResponse(
        UUID uploadId,
        UUID uploadRecordId,
        UploadStatus status,
        int uploadedParts,
        int expectedTotalParts
) {
}
