package org.schemeguard.backend.dto.Upload;

import java.time.Instant;
import java.util.UUID;

public record UploadSummaryResponse(
        UUID id,
        String fileName,
        Instant uploadedAt,
        String importStatus,
        String evaluationStatus,
        long transactionCount
) {
}