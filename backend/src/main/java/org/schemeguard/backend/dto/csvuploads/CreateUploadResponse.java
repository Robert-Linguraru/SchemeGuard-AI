package org.schemeguard.backend.dto.csvuploads;

import java.util.UUID;

public record CreateUploadResponse(
        UUID uploadId,
        UUID uploadRecordId,
        long chunkSizeBytes,
        int totalParts,
        int maxParallelUploads
) {
}
