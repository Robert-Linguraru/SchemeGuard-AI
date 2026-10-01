package org.schemeguard.backend.service.rag;

import org.schemeguard.backend.entity.Rule;
import org.schemeguard.backend.repository.RuleRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class RagDocumentService {

    private final JdbcTemplate jdbcTemplate;
    private final RagEmbeddingService embeddingService;
    private final RagTextChunker chunker;
    private final RuleRepository ruleRepository;
    private final int defaultTopK;
    private final double minimumSimilarity;

    public RagDocumentService(
            JdbcTemplate jdbcTemplate,
            RagEmbeddingService embeddingService,
            RagTextChunker chunker,
            RuleRepository ruleRepository,
            @Value("${app.rag.top-k:5}") int defaultTopK,
            @Value("${app.rag.minimum-similarity:0.20}") double minimumSimilarity
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.embeddingService = embeddingService;
        this.chunker = chunker;
        this.ruleRepository = ruleRepository;
        this.defaultTopK = defaultTopK;
        this.minimumSimilarity = minimumSimilarity;
    }

    @Transactional
    public int indexDocument(String title, String source, String content) {
        List<String> chunks = chunker.chunk(content);
        if (chunks.isEmpty()) {
            throw new IllegalArgumentException("Document content cannot be empty");
        }

        jdbcTemplate.update("DELETE FROM rag_document_chunks WHERE source = ?", source);
        for (int index = 0; index < chunks.size(); index++) {
            String chunk = chunks.get(index);
            jdbcTemplate.update("""
                    INSERT INTO rag_document_chunks
                        (id, source, title, chunk_index, content, metadata, embedding)
                    VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS vector))
                    """,
                    UUID.randomUUID(),
                    source,
                    title,
                    index,
                    chunk,
                    "{}",
                    toVectorLiteral(embeddingService.embed(chunk))
            );
        }
        return chunks.size();
    }

    @Transactional
    public int indexAllRules() {
        jdbcTemplate.update("DELETE FROM rag_document_chunks WHERE source LIKE 'rule:%'");
        int indexed = 0;
        for (Rule rule : ruleRepository.findAllCurrentlyApplicable()) {
            String scheme = rule.getScheme() == null ? "unknown" : rule.getScheme().getCode();
            String source = "rule:" + rule.getId();
            String title = scheme + " - " + rule.getRuleCode() + " - " + rule.getRuleName();
            String content = """
                    Card scheme: %s
                    Rule code: %s
                    Rule name: %s
                    Region: %s
                    Qualification category: %s
                    Interchange rate: %s
                    Conditions: %s
                    """.formatted(
                    scheme,
                    rule.getRuleCode(),
                    rule.getRuleName(),
                    rule.getRegion(),
                    rule.getQualificationCategory(),
                    rule.getInterchangeRate(),
                    rule.getConditions()
            );
            indexed += indexDocument(title, source, content);
        }
        return indexed;
    }

    public List<RagSearchResult> search(String query) {
        return search(query, defaultTopK);
    }

    public List<RagSearchResult> search(String query, int limit) {
        if (query == null || query.isBlank() || limit <= 0) {
            return List.of();
        }

        try {
            String queryVector = toVectorLiteral(embeddingService.embed(query));
            List<RagSearchResult> results = jdbcTemplate.query("""
                    SELECT source, title, content,
                           1 - (embedding <=> CAST(? AS vector)) AS similarity
                    FROM rag_document_chunks
                    ORDER BY embedding <=> CAST(? AS vector)
                    LIMIT ?
                    """,
                    (rs, rowNum) -> new RagSearchResult(
                            rs.getString("source"),
                            rs.getString("title"),
                            rs.getString("content"),
                            rs.getDouble("similarity")
                    ),
                    queryVector,
                    queryVector,
                    limit
            );
            return results.stream()
                    .filter(result -> result.similarity() >= minimumSimilarity)
                    .toList();
        } catch (DataAccessException | IllegalStateException exception) {
            // RAG is an enhancement. The exact transaction-based assistant remains available
            // when the optional pgvector schema or embedding model is not configured yet.
            return List.of();
        }
    }

    private String toVectorLiteral(List<Double> embedding) {
        return embedding.toString();
    }

    public record RagSearchResult(
            String source,
            String title,
            String content,
            double similarity
    ) {
    }
}
