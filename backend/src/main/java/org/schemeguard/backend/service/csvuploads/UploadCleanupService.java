package org.schemeguard.backend.service.csvuploads;

import org.schemeguard.backend.config.UploadProperties;
import org.schemeguard.backend.entity.csvuploads.UploadSession;
import org.schemeguard.backend.entity.csvuploads.UploadStatus;
import org.schemeguard.backend.repository.ProcessingJobRepository;
import org.schemeguard.backend.repository.csvuploads.UploadRepository;
import org.schemeguard.backend.repository.csvuploads.UploadSessionRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class UploadCleanupService {

    private final UploadSessionRepository sessionRepository;
    private final ProcessingJobRepository processingJobRepository;
    private final StorageService storageService;
    private final UploadProperties properties;
    private final UploadRepository uploadRepository;

    public UploadCleanupService(
            UploadSessionRepository sessionRepository,
            ProcessingJobRepository processingJobRepository,
            StorageService storageService,
            UploadProperties properties,
            UploadRepository uploadRepository
    ) {
        this.sessionRepository = sessionRepository;
        this.processingJobRepository = processingJobRepository;
        this.storageService = storageService;
        this.properties = properties;
        this.uploadRepository = uploadRepository;
    }

    @Scheduled(fixedDelayString = "${app.upload.cleanup-interval-ms:3600000}")
    @Transactional
    public void deleteStaleSessions() {
        Instant cutoff = Instant.now()
                .minus(properties.getSessionTtlHours(), ChronoUnit.HOURS);
        List<UploadSession> staleSessions = sessionRepository.findStaleSessions(
                List.of(
                        UploadStatus.UPLOADING,
                        UploadStatus.DUPLICATES_FOUND,
                        UploadStatus.FAILED,
                        UploadStatus.DUPLICATE,
                        UploadStatus.CANCELLED
                ),
                cutoff
        );
        for (UploadSession session : staleSessions) {
            storageService.deleteUpload(session.getId());

            uploadRepository.findBySession_Id(session.getId())
                    .ifPresent(uploadRepository::delete);

            if (session.getProcessingJobId() != null) {
                processingJobRepository.findById(session.getProcessingJobId())
                        .ifPresent(processingJobRepository::delete);
            }

            sessionRepository.delete(session);
        }
    }
}
