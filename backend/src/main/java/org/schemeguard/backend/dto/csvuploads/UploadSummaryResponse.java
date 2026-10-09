package org.schemeguard.backend.dto.csvuploads;

import java.time.Instant;
import java.util.UUID;

public record UploadSummaryResponse(
        UUID id,
        UUID sessionId,
        String fileName,
        String sourceName,
        Instant uploadedAt,
        String importStatus,
        boolean wasEvaluated,
        String evaluationStatus,
        long transactionCount,
        long duplicateRows
) {
}
