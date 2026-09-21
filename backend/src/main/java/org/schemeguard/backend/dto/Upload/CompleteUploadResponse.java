package org.schemeguard.backend.dto.Upload;

import org.schemeguard.backend.entity.enums.UploadStatus;

import java.util.UUID;

public record CompleteUploadResponse(
        UUID uploadId,
        UUID uploadRecordId,
        UploadStatus status,
        int uploadedParts,
        int expectedTotalParts
) {
}
