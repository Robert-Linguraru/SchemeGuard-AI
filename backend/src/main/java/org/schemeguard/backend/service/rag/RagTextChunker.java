package org.schemeguard.backend.service.rag;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class RagTextChunker {

    private final int maxCharacters;
    private final int overlapCharacters;

    public RagTextChunker(
            @Value("${app.rag.chunk-size:1200}") int maxCharacters,
            @Value("${app.rag.chunk-overlap:180}") int overlapCharacters
    ) {
        if (maxCharacters <= 0 || overlapCharacters < 0 || overlapCharacters >= maxCharacters) {
            throw new IllegalArgumentException("Invalid RAG chunk size or overlap");
        }
        this.maxCharacters = maxCharacters;
        this.overlapCharacters = overlapCharacters;
    }

    public List<String> chunk(String content) {
        String normalized = content == null
                ? ""
                : content.replace("\r\n", "\n").replace("\r", "\n").trim();
        if (normalized.isBlank()) {
            return List.of();
        }

        List<String> chunks = new ArrayList<>();
        int start = 0;
        while (start < normalized.length()) {
            int proposedEnd = Math.min(start + maxCharacters, normalized.length());
            int end = proposedEnd;
            if (proposedEnd < normalized.length()) {
                int paragraphBreak = normalized.lastIndexOf("\n\n", proposedEnd);
                int sentenceBreak = normalized.lastIndexOf(". ", proposedEnd);
                int preferredBreak = Math.max(paragraphBreak, sentenceBreak);
                if (preferredBreak > start + maxCharacters / 2) {
                    end = preferredBreak + (preferredBreak == paragraphBreak ? 2 : 1);
                }
            }

            String chunk = normalized.substring(start, end).trim();
            if (!chunk.isBlank()) {
                chunks.add(chunk);
            }

            if (end >= normalized.length()) {
                break;
            }
            start = Math.max(start + 1, end - overlapCharacters);
        }
        return chunks;
    }
}
