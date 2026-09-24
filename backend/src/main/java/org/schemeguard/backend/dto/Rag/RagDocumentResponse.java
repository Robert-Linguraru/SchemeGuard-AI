package org.schemeguard.backend.dto.Rag;

public record RagDocumentResponse(
        String source,
        int chunksIndexed
) {
}
