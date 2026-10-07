package org.schemeguard.backend.dto.csvuploads;

public record PartUploadResponse(
        int partNumber,
        long sizeBytes,
        String sha256,
        boolean alreadyUploaded
) {
}
