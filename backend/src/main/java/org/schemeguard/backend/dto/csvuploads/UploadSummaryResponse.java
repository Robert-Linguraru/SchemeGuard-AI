package org.schemeguard.backend.dto.csvuploads;

import java.time.Instant;
import java.util.UUID;

public record UploadSummaryResponse(
        UUID id,
        String fileName,
        Instant uploadedAt,
        String importStatus,
        boolean wasEvaluated,
        String evaluationStatus,
        long transactionCount
) {
}