package org.schemeguard.backend.service.csvUpload;

import org.schemeguard.backend.entity.UploadPart;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
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
    public void write(
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

        if (expectedSha256 != null
                && !HexFormat.of().formatHex(digest.digest())
                .equalsIgnoreCase(expectedSha256)) {
            throw new IllegalArgumentException(
                    "The complete file checksum does not match the declared checksum"
            );
        }
    }

    private static MessageDigest sha256Digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required", exception);
        }
    }
}
