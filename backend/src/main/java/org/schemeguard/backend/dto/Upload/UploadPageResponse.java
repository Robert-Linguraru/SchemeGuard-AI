package org.schemeguard.backend.dto.Upload;

import java.util.List;

public record UploadPageResponse(
        List<UploadSummaryResponse> content,
        int number,
        int size,
        long totalElements,
        int totalPages
) {
}