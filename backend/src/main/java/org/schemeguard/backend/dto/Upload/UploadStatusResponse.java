package org.schemeguard.backend.dto.Upload;

import org.schemeguard.backend.entity.enums.UploadStatus;

import java.time.Instant;
import java.util.UUID;

public record UploadStatusResponse(
        UUID uploadId,
        UUID uploadRecordId,
        String fileName,
        UploadStatus status,
        long expectedFileSizeBytes,
        long uploadedBytes,
        int uploadedParts,
        int expectedTotalParts,
        long processedRows,
        String errorMessage,
        Instant uploadedAt
) {
}
