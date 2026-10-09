package org.schemeguard.backend.service.csvuploads;

import org.schemeguard.backend.entity.csvuploads.UploadPart;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.PreparedStatement;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Component
public class UploadDocumentWriter {

    private static final String UPDATE_DOCUMENT_SQL = """
            UPDATE uploads
            SET document = ?
            WHERE id = ?
            """;

    private static final String DUPLICATE_CONTENT_SQL = """
            SELECT EXISTS (
                SELECT 1
                FROM uploads candidate
                JOIN uploads existing
                  ON existing.user_id = candidate.user_id
                 AND existing.source_id = candidate.source_id
                WHERE candidate.id = ?
                  AND existing.id <> candidate.id
                  AND existing.content_sha256 = ?
            )
            """;

    private static final String SET_CONTENT_HASH_SQL = """
            UPDATE uploads
            SET content_sha256 = ?
            WHERE id = ?
            """;

    private final JdbcTemplate jdbcTemplate;
    private final StorageService storageService;

    public UploadDocumentWriter(
            JdbcTemplate jdbcTemplate,
            StorageService storageService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.storageService = storageService;
    }

    @Transactional
    public String write(
            UUID uploadRecordId,
            List<UploadPart> parts,
            long expectedFileSize,
            String expectedSha256
    ) throws IOException {
        MessageDigest digest = sha256Digest();

        jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
            try (InputStream source = storageService.openConcatenatedStream(parts);
                 DigestInputStream input = new DigestInputStream(source, digest);
                 PreparedStatement statement = connection.prepareStatement(
                         UPDATE_DOCUMENT_SQL
                 )) {
                statement.setBinaryStream(1, input, expectedFileSize);
                statement.setObject(2, uploadRecordId);
                if (statement.executeUpdate() != 1) {
                    throw new IllegalStateException("Stored upload not found.");
                }
            } catch (IOException exception) {
                throw new IllegalStateException(
                        "Could not stream the uploaded document to PostgreSQL.",
                        exception
                );
            }
            return null;
        });

        String contentSha256 = HexFormat.of().formatHex(digest.digest());
        if (expectedSha256 != null && !contentSha256.equalsIgnoreCase(expectedSha256)) {
            throw new IllegalArgumentException(
                    "The complete file checksum does not match the declared checksum"
            );
        }

        Boolean alreadyImported = jdbcTemplate.queryForObject(
                DUPLICATE_CONTENT_SQL,
                Boolean.class,
                uploadRecordId,
                contentSha256
        );
        if (Boolean.TRUE.equals(alreadyImported)) {
            throw new DuplicateUploadException();
        }

        try {
            jdbcTemplate.update(SET_CONTENT_HASH_SQL, contentSha256, uploadRecordId);
        } catch (DataIntegrityViolationException exception) {
            // Keep the per-user file uniqueness guarantee for concurrent imports.
            throw new DuplicateUploadException(exception);
        }

        return contentSha256;
    }

    private static MessageDigest sha256Digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required", exception);
        }
    }
}
