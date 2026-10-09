package org.schemeguard.backend.dto.csvuploads;

import org.schemeguard.backend.entity.csvuploads.UploadStatus;

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
        long duplicateRows,
        String errorMessage,
        Instant uploadedAt
) {
}
