package org.schemeguard.backend;

import org.junit.jupiter.api.Test;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.repository.UploadRepository;
import org.schemeguard.backend.service.TransactionService;
import org.schemeguard.backend.service.csvUpload.UploadDownloadService;
import org.schemeguard.backend.service.csvUpload.UploadStatisticsService;
import org.schemeguard.backend.service.csvUpload.UploadService;
import org.schemeguard.backend.service.ruleIntepreter.RuleEngine;
import org.schemeguard.backend.service.ruleIntepreter.UploadEvaluationService;
import org.schemeguard.backend.controller.TransactionUploadController;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UploadDownloadControllerTests {

    @Test
    void downloadResponseContainsCsvHeadersAndOriginalBytes() {
        UploadDownloadService downloadService = mock(UploadDownloadService.class);
        TransactionUploadController controller = new TransactionUploadController(
                mock(UploadService.class),
                mock(TransactionService.class),
                mock(UploadEvaluationService.class),
                downloadService,
                mock(UploadStatisticsService.class)
        );
        UUID uploadId = UUID.randomUUID();
        User user = new User();
        byte[] document = "id,amount\n1,10\n".getBytes(StandardCharsets.UTF_8);
        when(downloadService.download(user, uploadId))
                .thenReturn(new UploadDownloadService.DownloadedUpload(document, "original.csv"));

        ResponseEntity<byte[]> response = controller.downloadUpload(uploadId, user);

        assertArrayEquals(document, response.getBody());
        assertEquals(MediaType.parseMediaType("text/csv"), response.getHeaders().getContentType());
        String contentDisposition = response.getHeaders().getFirst("Content-Disposition");
        assertEquals(true, contentDisposition.startsWith("attachment;"));
        assertEquals(true, contentDisposition.contains("filename=\"original.csv\""));
    }
}