package org.schemeguard.backend;

import org.junit.jupiter.api.Test;
import org.schemeguard.backend.entity.Upload;
import org.schemeguard.backend.entity.UploadSession;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.UploadRepository;
import org.schemeguard.backend.service.csvUpload.UploadDownloadService;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UploadDownloadServiceTests {

    private final UploadRepository uploadRepository = mock(UploadRepository.class);
    private final UploadDownloadService service = new UploadDownloadService(uploadRepository);

    @Test
    void ownerCanDownloadTheirOriginalCsv() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        byte[] document = "external_id,amount\nTX-1,25.00\n".getBytes(StandardCharsets.UTF_8);
        Upload upload = upload("original.csv", document);
        when(uploadRepository.findByIdAndUser_Id(uploadId, user.getId()))
                .thenReturn(Optional.of(upload));

        UploadDownloadService.DownloadedUpload result = service.download(user, uploadId);

        assertArrayEquals(document, result.document());
        assertEquals("original.csv", result.fileName());
        verify(uploadRepository).findByIdAndUser_Id(uploadId, user.getId());
    }

    @Test
    void anotherUserCannotDownloadTheUpload() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findByIdAndUser_Id(uploadId, user.getId()))
                .thenReturn(Optional.empty());

        UploadException exception = assertThrows(
                UploadException.class,
                () -> service.download(user, uploadId)
        );

        assertEquals("UPLOAD_NOT_FOUND", exception.getCode());
        verify(uploadRepository).findByIdAndUser_Id(uploadId, user.getId());
    }

    @Test
    void nonexistentUploadReturnsTheSameNotFoundError() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findByIdAndUser_Id(uploadId, user.getId()))
                .thenReturn(Optional.empty());

        UploadException exception = assertThrows(
                UploadException.class,
                () -> service.download(user, uploadId)
        );

        assertEquals(404, exception.getStatus().value());
        assertEquals("Upload not found.", exception.getMessage());
    }

    @Test
    void missingDocumentProducesAnEmptyDownload() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        Upload upload = upload("empty.csv", null);
        when(uploadRepository.findByIdAndUser_Id(uploadId, user.getId()))
                .thenReturn(Optional.of(upload));

        UploadDownloadService.DownloadedUpload result = service.download(user, uploadId);

        assertArrayEquals(new byte[0], result.document());
        assertEquals("empty.csv", result.fileName());
    }

    @Test
    void unsafeFilenameIsSanitized() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        Upload upload = upload("..\\\"\r\nsecret.csv", new byte[] {1});
        when(uploadRepository.findByIdAndUser_Id(uploadId, user.getId()))
                .thenReturn(Optional.of(upload));

        UploadDownloadService.DownloadedUpload result = service.download(user, uploadId);

        assertEquals("..____secret.csv", result.fileName());
    }

    @Test
    void blankFilenameUsesCsvFallback() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        Upload upload = upload("   ", new byte[0]);
        when(uploadRepository.findByIdAndUser_Id(uploadId, user.getId()))
                .thenReturn(Optional.of(upload));

        assertEquals("original-file.csv", service.download(user, uploadId).fileName());
    }

    private Upload upload(String fileName, byte[] document) {
        UploadSession session = new UploadSession(
                UUID.randomUUID(),
                fileName,
                document == null ? 0 : document.length,
                1,
                null
        );
        return new Upload(user(UUID.randomUUID()), session, document);
    }

    private User user(UUID id) {
        User user = new User();
        user.setId(id);
        return user;
    }
}