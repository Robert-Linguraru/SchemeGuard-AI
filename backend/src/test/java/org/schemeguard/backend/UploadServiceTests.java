package org.schemeguard.backend;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.schemeguard.backend.dto.Upload.UploadPageResponse;
import org.schemeguard.backend.dto.Upload.UploadSummaryResponse;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.repository.UploadRepository;
import org.schemeguard.backend.repository.UploadSummaryProjection;
import org.schemeguard.backend.repository.UploadSessionRepository;
import org.schemeguard.backend.repository.UploadPartRepository;
import org.schemeguard.backend.repository.ProcessingJobRepository;
import org.schemeguard.backend.service.csvUpload.PartRegistrationService;
import org.schemeguard.backend.service.csvUpload.StorageService;
import org.schemeguard.backend.service.csvUpload.UploadPolicy;
import org.schemeguard.backend.service.csvUpload.UploadService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UploadServiceTests {

    private final UploadSessionRepository sessionRepository = mock(UploadSessionRepository.class);
    private final UploadRepository uploadRepository = mock(UploadRepository.class);
    private final UploadPartRepository partRepository = mock(UploadPartRepository.class);
    private final ProcessingJobRepository processingJobRepository = mock(ProcessingJobRepository.class);
    private final UploadPolicy policy = mock(UploadPolicy.class);
    private final StorageService storageService = mock(StorageService.class);
    private final PartRegistrationService partRegistrationService = mock(PartRegistrationService.class);
    private final ObjectProvider<org.schemeguard.backend.service.csvUpload.CsvImportService> csvImportServiceProvider = mock(ObjectProvider.class);
    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    private UploadService uploadService;

    @BeforeEach
    void setUp() {
        uploadService = new UploadService(
                sessionRepository,
                uploadRepository,
                partRepository,
                processingJobRepository,
                policy,
                storageService,
                partRegistrationService,
                csvImportServiceProvider,
                jdbcTemplate
        );
    }

    @Test
    void authenticatedUserReceivesOnlyTheirUploads() {
        UUID userId = UUID.randomUUID();
        UUID uploadId = UUID.randomUUID();
        User user = user(userId);
        UploadSummaryProjection ownUpload = projection(uploadId, "mine.csv", 40, 1);
        when(uploadRepository.findSummariesByUserId(userId, any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(ownUpload), PageRequest.of(0, 20), 1));

        UploadPageResponse response = uploadService.findUploads(user, 0, 20);

        assertEquals(List.of(uploadId), response.content().stream().map(UploadSummaryResponse::id).toList());
        verify(uploadRepository).findSummariesByUserId(userId, PageRequest.of(0, 20));
    }

    @Test
    void uploadsBelongingToAnotherUserAreExcluded() {
        UUID authenticatedUserId = UUID.randomUUID();
        User user = user(authenticatedUserId);
        when(uploadRepository.findSummariesByUserId(authenticatedUserId, any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        UploadPageResponse response = uploadService.findUploads(user, 0, 20);

        assertEquals(List.of(), response.content());
        assertEquals(0, response.totalElements());
        verify(uploadRepository).findSummariesByUserId(authenticatedUserId, PageRequest.of(0, 20));
    }

    @Test
    void emptyResultReturnsAnEmptyPage() {
        User user = user(UUID.randomUUID());
        when(uploadRepository.findSummariesByUserId(user.getId(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        UploadPageResponse response = uploadService.findUploads(user, 0, 20);

        assertEquals(List.of(), response.content());
        assertEquals(0, response.number());
        assertEquals(20, response.size());
        assertEquals(0, response.totalElements());
        assertEquals(0, response.totalPages());
    }

    @Test
    void paginationUsesRequestedPageAndSize() {
        User user = user(UUID.randomUUID());
        UploadSummaryProjection upload = projection(UUID.randomUUID(), "page-two.csv", 5, 5);
        when(uploadRepository.findSummariesByUserId(user.getId(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(upload), PageRequest.of(1, 20), 41));

        UploadPageResponse response = uploadService.findUploads(user, 1, 20);

        assertEquals(1, response.number());
        assertEquals(20, response.size());
        assertEquals(41, response.totalElements());
        assertEquals(3, response.totalPages());
    }

    @Test
    void uploadsWithNoRemainingNewTransactionsAreEvaluated() {
        User user = user(UUID.randomUUID());
        UploadSummaryProjection upload = projection(UUID.randomUUID(), "evaluated.csv", 40, 0);
        when(uploadRepository.findSummariesByUserId(user.getId(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(upload), PageRequest.of(0, 20), 1));

        UploadSummaryResponse response = uploadService.findUploads(user, 0, 20).content().getFirst();

        assertEquals(40, response.transactionCount());
        assertEquals("EVALUATED", response.evaluationStatus());
    }

    private User user(UUID id) {
        User user = new User();
        user.setId(id);
        return user;
    }

    private UploadSummaryProjection projection(
            UUID id,
            String fileName,
            long transactionCount,
            long newTransactionCount
    ) {
        UploadSummaryProjection projection = mock(UploadSummaryProjection.class);
        when(projection.getId()).thenReturn(id);
        when(projection.getFileName()).thenReturn(fileName);
        when(projection.getUploadedAt()).thenReturn(Instant.parse("2026-09-21T14:30:00Z"));
        when(projection.getImportStatus()).thenReturn("COMPLETED");
        when(projection.getTransactionCount()).thenReturn(transactionCount);
        when(projection.getNewTransactionCount()).thenReturn(newTransactionCount);
        return projection;
    }
}
