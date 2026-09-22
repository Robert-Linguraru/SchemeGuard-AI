package org.schemeguard.backend;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.schemeguard.backend.dto.Upload.UploadPageResponse;
import org.schemeguard.backend.dto.Upload.UploadSummaryResponse;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.repository.ProcessingJobRepository;
import org.schemeguard.backend.repository.UploadPartRepository;
import org.schemeguard.backend.repository.UploadRepository;
import org.schemeguard.backend.repository.UploadSessionRepository;
import org.schemeguard.backend.repository.UploadSummaryProjection;
import org.schemeguard.backend.service.csvUpload.PartRegistrationService;
import org.schemeguard.backend.service.csvUpload.StorageService;
import org.schemeguard.backend.service.csvUpload.TransactionBatchWriter;
import org.schemeguard.backend.service.csvUpload.UploadPolicy;
import org.schemeguard.backend.service.csvUpload.UploadService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UploadListServiceTests {

    private final UploadSessionRepository sessionRepository = mock(UploadSessionRepository.class);
    private final UploadRepository uploadRepository = mock(UploadRepository.class);
    private final UploadPartRepository partRepository = mock(UploadPartRepository.class);
    private final ProcessingJobRepository processingJobRepository = mock(ProcessingJobRepository.class);
    private final UploadPolicy policy = mock(UploadPolicy.class);
    private final StorageService storageService = mock(StorageService.class);
    private final TransactionBatchWriter transactionBatchWriter = mock(TransactionBatchWriter.class);
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
                transactionBatchWriter,
                partRegistrationService,
                csvImportServiceProvider,
                jdbcTemplate
        );
    }

    @Test
    void newUploadReturnsWasEvaluatedFalse() {
        User user = user(UUID.randomUUID());
        UploadSummaryProjection projection = projection(false, 100, 100);
        when(uploadRepository.findSummariesByUserId(eq(user.getId()), isNull(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(projection), PageRequest.of(0, 20), 1));

        UploadSummaryResponse response = uploadService.findUploads(user, 0, 20, null).content().getFirst();

        assertEquals(false, response.wasEvaluated());
        assertEquals("NOT_EVALUATED", response.evaluationStatus());
    }

    @Test
    void evaluatedUploadReturnsWasEvaluatedTrue() {
        User user = user(UUID.randomUUID());
        UploadSummaryProjection projection = projection(true, 100, 0);
        when(uploadRepository.findSummariesByUserId(eq(user.getId()), isNull(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(projection), PageRequest.of(0, 20), 1));

        UploadSummaryResponse response = uploadService.findUploads(user, 0, 20, null).content().getFirst();

        assertEquals(true, response.wasEvaluated());
        assertEquals("EVALUATED", response.evaluationStatus());
    }

    @Test
    void uploadsAreFilteredByAuthenticatedUser() {
        UUID userId = UUID.randomUUID();
        User user = user(userId);
        when(uploadRepository.findSummariesByUserId(eq(userId), isNull(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

            UploadPageResponse response = uploadService.findUploads(user, 0, 20, null);

        assertEquals(List.of(), response.content());
            verify(uploadRepository).findSummariesByUserId(eq(userId), isNull(), eq(PageRequest.of(0, 20)));
    }

    @Test
    void uploadListPaginationIsPreserved() {
        User user = user(UUID.randomUUID());
        UploadSummaryProjection projection = projection(false, 5, 5);
        when(uploadRepository.findSummariesByUserId(eq(user.getId()), eq("page"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(projection), PageRequest.of(1, 20), 41));

        UploadPageResponse response = uploadService.findUploads(user, 1, 20, "page");

        assertEquals(1, response.number());
        assertEquals(20, response.size());
        assertEquals(41, response.totalElements());
        assertEquals(3, response.totalPages());
    }

    @Test
    void searchIsPassedToRepositoryForFilenameFiltering() {
        User user = user(UUID.randomUUID());
        UploadSummaryProjection projection = projection(false, 5, 5);
        when(uploadRepository.findSummariesByUserId(eq(user.getId()), eq("FiLe.CsV"), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(projection), PageRequest.of(0, 20), 1));

        UploadPageResponse response = uploadService.findUploads(user, 0, 20, "FiLe.CsV");

        assertEquals(1, response.totalElements());
        verify(uploadRepository).findSummariesByUserId(eq(user.getId()), eq("FiLe.CsV"), eq(PageRequest.of(0, 20)));
    }

    @Test
    void blankSearchIsPassedThroughAsUnfilteredSearch() {
        User user = user(UUID.randomUUID());
        when(uploadRepository.findSummariesByUserId(eq(user.getId()), eq("  "), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        UploadPageResponse response = uploadService.findUploads(user, 0, 20, "  ");

        assertEquals(List.of(), response.content());
        verify(uploadRepository).findSummariesByUserId(eq(user.getId()), eq("  "), eq(PageRequest.of(0, 20)));
    }

    private User user(UUID id) {
        User user = new User();
        user.setId(id);
        return user;
    }

    private UploadSummaryProjection projection(boolean wasEvaluated, long transactionCount, long newTransactionCount) {
        UploadSummaryProjection projection = mock(UploadSummaryProjection.class);
        when(projection.getId()).thenReturn(UUID.randomUUID());
        when(projection.getFileName()).thenReturn("transactions.csv");
        when(projection.getUploadedAt()).thenReturn(Instant.parse("2026-09-22T12:00:00Z"));
        when(projection.getImportStatus()).thenReturn("COMPLETED");
        when(projection.getWasEvaluated()).thenReturn(wasEvaluated);
        when(projection.getTransactionCount()).thenReturn(transactionCount);
        when(projection.getNewTransactionCount()).thenReturn(newTransactionCount);
        return projection;
    }
}