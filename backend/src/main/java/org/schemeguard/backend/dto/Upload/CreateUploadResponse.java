package org.schemeguard.backend.dto.Upload;

import java.util.UUID;

public record CreateUploadResponse(
        UUID uploadId,
        UUID uploadRecordId,
        long chunkSizeBytes,
        int totalParts,
        int maxParallelUploads
) {
}
