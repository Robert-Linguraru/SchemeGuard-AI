package org.schemeguard.backend.service.csvUpload;

import org.schemeguard.backend.entity.Upload;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.UploadRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class UploadDownloadService {

    private static final String FALLBACK_FILE_NAME = "original-file.csv";

    private final UploadRepository uploadRepository;

    public UploadDownloadService(UploadRepository uploadRepository) {
        this.uploadRepository = uploadRepository;
    }

    @Transactional(readOnly = true)
    public DownloadedUpload download(User user, UUID uploadId) {
        Upload upload = uploadRepository.findByIdAndUser_Id(uploadId, user.getId())
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload not found."
                ));

        String fileName = sanitizeFileName(upload.getSession().getOriginalFileName());
        byte[] document = upload.getDocument();
        return new DownloadedUpload(
                document == null ? new byte[0] : document,
                fileName
        );
    }

    static String sanitizeFileName(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return FALLBACK_FILE_NAME;
        }

        String sanitized = fileName
                .replaceAll("[\\r\\n\\\\/\\\"\\p{Cntrl}]", "_")
                .trim();

        return sanitized.isBlank() ? FALLBACK_FILE_NAME : sanitized;
    }

    public record DownloadedUpload(byte[] document, String fileName) {
    }
}