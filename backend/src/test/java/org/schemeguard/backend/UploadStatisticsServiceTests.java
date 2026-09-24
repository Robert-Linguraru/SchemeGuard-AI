package org.schemeguard.backend;

import org.junit.jupiter.api.Test;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.UploadRepository;
import org.schemeguard.backend.repository.UploadStatisticsProjection;
import org.schemeguard.backend.service.csvUpload.UploadStatisticsService;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UploadStatisticsServiceTests {

    private final UploadRepository uploadRepository = mock(UploadRepository.class);
    private final UploadStatisticsService service = new UploadStatisticsService(uploadRepository);

    @Test
    void returnsCompleteScopedStatisticsAndQualificationRate() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findStatisticsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(Optional.of(projection(100, 80, 20, 50, 10, 20, "12500.50", "42.75")));

        var result = service.getStatistics(user, uploadId);

        assertEquals(100, result.totalTransactions());
        assertEquals(80, result.processedTransactions());
        assertEquals(20, result.pendingTransactions());
        assertEquals(50, result.qualifiedTransactions());
        assertEquals(10, result.partiallyQualifiedTransactions());
        assertEquals(20, result.notQualifiedTransactions());
        assertEquals(new BigDecimal("12500.50"), result.totalAmount());
        assertEquals(new BigDecimal("42.75"), result.totalFees());
        assertEquals(new BigDecimal("0.625000"), result.qualificationRate());
        verify(uploadRepository).findStatisticsByIdAndUserId(uploadId, user.getId());
    }

    @Test
    void zeroTransactionUploadReturnsZeroValues() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findStatisticsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(Optional.of(projection(0, 0, 0, 0, 0, 0, null, null)));

        var result = service.getStatistics(user, uploadId);

        assertEquals(0, result.totalTransactions());
        assertEquals(BigDecimal.ZERO, result.totalAmount());
        assertEquals(BigDecimal.ZERO, result.totalFees());
        assertEquals(BigDecimal.ZERO, result.qualificationRate());
    }

    @Test
    void pendingTransactionsDoNotCountAsQualifiedOrProcessed() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findStatisticsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(Optional.of(projection(4, 0, 4, 0, 0, 0, "10", "0")));

        var result = service.getStatistics(user, uploadId);

        assertEquals(0, result.processedTransactions());
        assertEquals(0, result.qualifiedTransactions());
        assertEquals(BigDecimal.ZERO, result.qualificationRate());
    }

    @Test
    void foreignOrMissingUploadReturnsNotFound() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findStatisticsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(Optional.empty());

        UploadException exception = assertThrows(
                UploadException.class,
                () -> service.getStatistics(user, uploadId)
        );

        assertEquals(404, exception.getStatus().value());
        assertEquals("UPLOAD_NOT_FOUND", exception.getCode());
    }

    private UploadStatisticsProjection projection(
            long total,
            long processed,
            long pending,
            long qualified,
            long partial,
            long notQualified,
            String amount,
            String fees
    ) {
        BigDecimal totalAmount = amount == null ? null : new BigDecimal(amount);
        BigDecimal totalFees = fees == null ? null : new BigDecimal(fees);
        return new UploadStatisticsProjection() {
            public long getTotalTransactions() { return total; }
            public long getProcessedTransactions() { return processed; }
            public long getPendingTransactions() { return pending; }
            public long getQualifiedTransactions() { return qualified; }
            public long getPartiallyQualifiedTransactions() { return partial; }
            public long getNotQualifiedTransactions() { return notQualified; }
            public BigDecimal getTotalAmount() { return totalAmount; }
            public BigDecimal getTotalFees() { return totalFees; }
        };
    }

    private User user(UUID id) {
        User user = new User();
        user.setId(id);
        return user;
    }
}