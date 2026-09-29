package org.schemeguard.backend.dto.Rag;

import jakarta.validation.constraints.NotBlank;

public record RagDocumentRequest(
        @NotBlank String title,
        @NotBlank String source,
        @NotBlank String content
) {
}
