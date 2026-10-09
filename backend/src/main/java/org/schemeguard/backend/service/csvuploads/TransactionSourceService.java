package org.schemeguard.backend.service.csvuploads;

import org.schemeguard.backend.dto.csvuploads.TransactionSourceResponse;
import org.schemeguard.backend.entity.csvuploads.TransactionSource;
import org.schemeguard.backend.repository.csvuploads.TransactionSourceRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class TransactionSourceService {

    private static final String UPSERT_SOURCE_SQL = """
            INSERT INTO transaction_sources (id, name, normalized_name)
            VALUES (?, ?, ?)
            ON CONFLICT (normalized_name)
            DO UPDATE SET normalized_name = EXCLUDED.normalized_name
            RETURNING id
            """;

    private final JdbcTemplate jdbcTemplate;
    private final TransactionSourceRepository sourceRepository;

    public TransactionSourceService(
            JdbcTemplate jdbcTemplate,
            TransactionSourceRepository sourceRepository
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.sourceRepository = sourceRepository;
    }

    @Transactional
    public TransactionSource resolveOrCreate(String submittedName) {
        String displayName = normalizeDisplayName(submittedName);
        String normalizedName = displayName.toLowerCase(Locale.ROOT);
        UUID sourceId = jdbcTemplate.queryForObject(
                UPSERT_SOURCE_SQL,
                UUID.class,
                UUID.randomUUID(),
                displayName,
                normalizedName
        );
        if (sourceId == null) {
            throw new IllegalStateException("Could not resolve transaction source.");
        }
        return sourceRepository.getReferenceById(sourceId);
    }

    @Transactional(readOnly = true)
    public List<TransactionSourceResponse> findAll() {
        return sourceRepository.findAllByOrderByNormalizedNameAsc().stream()
                .map(source -> new TransactionSourceResponse(source.getId(), source.getName()))
                .toList();
    }

    private String normalizeDisplayName(String submittedName) {
        if (!StringUtils.hasText(submittedName)) {
            throw new IllegalArgumentException("A transaction source is required.");
        }
        String normalizedUnicode = Normalizer.normalize(submittedName, Normalizer.Form.NFKC);
        String displayName = normalizedUnicode.trim().replaceAll("\\s+", " ");
        if (displayName.length() > 255) {
            throw new IllegalArgumentException("Transaction source must contain at most 255 characters.");
        }
        return displayName;
    }
}
