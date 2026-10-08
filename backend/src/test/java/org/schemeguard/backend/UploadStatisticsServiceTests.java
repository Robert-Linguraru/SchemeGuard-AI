package org.schemeguard.backend;

import org.junit.jupiter.api.Test;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.csvuploads.UploadRepository;
import org.schemeguard.backend.repository.csvuploads.UploadStatisticsProjection;
import org.schemeguard.backend.repository.csvuploads.UploadFeeProjection;
import org.schemeguard.backend.repository.CurrencyRateRepository;
import org.schemeguard.backend.entity.CurrencyRate;
import org.schemeguard.backend.entity.CurrencyRateId;
import org.schemeguard.backend.exception.CurrencyConversionException;
import org.schemeguard.backend.service.currency.CurrencyRateService;
import org.schemeguard.backend.service.csvuploads.UploadStatisticsService;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;

class UploadStatisticsServiceTests {

    private final UploadRepository uploadRepository = mock(UploadRepository.class);
    private final CurrencyRateRepository rateRepository = mock(CurrencyRateRepository.class);
    private final UploadStatisticsService service = new UploadStatisticsService(
            uploadRepository, new CurrencyRateService(rateRepository));

    @Test
    void returnsCompleteScopedStatisticsAndQualificationRate() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findStatisticsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(Optional.of(projection(100, 80, 20, 50, 10, 20, "12500.50")));
        when(uploadRepository.findFeeGroupsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(List.of(fees("EUR", "42.75", 1)));

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
                .thenReturn(Optional.of(projection(0, 0, 0, 0, 0, 0, null)));

        var result = service.getStatistics(user, uploadId);

        assertEquals(0, result.totalTransactions());
        assertEquals(BigDecimal.ZERO, result.totalAmount());
        assertEquals(new BigDecimal("0.00"), result.totalFees());
        assertEquals(BigDecimal.ZERO, result.qualificationRate());
    }

    @Test
    void pendingTransactionsDoNotCountAsQualifiedOrProcessed() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findStatisticsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(Optional.of(projection(4, 0, 4, 0, 0, 0, "10")));

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
        verifyNoInteractions(rateRepository);
    }

    @Test
    void convertsAllFeesAndRoundsPerTransactionWithOneRateLookupPerCurrency() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findStatisticsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(Optional.of(projection(204, 204, 0, 204, 0, 0, "0")));
        when(uploadRepository.findFeeGroupsByIdAndUserId(uploadId, user.getId())).thenReturn(List.of(
                fees("USD", "1.005", 200), fees("USD", "2.005", 1),
                fees("GBP", "1.004", 2), fees("EUR", "0.105", 1)));
        rate("USD", "0.90");
        rate("GBP", "1.20");

        var result = service.getStatistics(user, uploadId);

        // 200 * 0.90 + 1.80 + 2 * 1.20 + 0.11; not rounding a grouped sum.
        assertEquals(new BigDecimal("184.31"), result.totalFees());
        assertEquals(204, result.processedTransactions());
        assertEquals(204, result.qualifiedTransactions());
        verify(rateRepository).findById(new CurrencyRateId("USD", "EUR"));
        verify(rateRepository).findById(new CurrencyRateId("GBP", "EUR"));
        verify(uploadRepository).findFeeGroupsByIdAndUserId(uploadId, user.getId());
    }

    @Test
    void missingRateFailsRatherThanReturningPartialTotal() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findStatisticsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(Optional.of(projection(2, 2, 0, 2, 0, 0, "0")));
        when(uploadRepository.findFeeGroupsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(List.of(fees("EUR", "10", 1), fees("USD", "10", 1)));
        assertThrows(CurrencyConversionException.class, () -> service.getStatistics(user, uploadId));
    }

    @Test
    void zeroFeesDoNotRequireExchangeRates() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.findStatisticsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(Optional.of(projection(1, 1, 0, 1, 0, 0, "0")));
        when(uploadRepository.findFeeGroupsByIdAndUserId(uploadId, user.getId()))
                .thenReturn(List.of(fees("USD", "0.0000", 1)));
        assertEquals(new BigDecimal("0.00"), service.getStatistics(user, uploadId).totalFees());
        verifyNoInteractions(rateRepository);
    }

    private UploadFeeProjection fees(String currency, String amount, long count) {
        return new UploadFeeProjection() {
            public String getCurrency() { return currency; }
            public BigDecimal getFee() { return new BigDecimal(amount); }
            public long getTransactionCount() { return count; }
        };
    }

    private void rate(String currency, String value) {
        CurrencyRate rate = new CurrencyRate();
        rate.setRate(new BigDecimal(value));
        when(rateRepository.findById(new CurrencyRateId(currency, "EUR"))).thenReturn(Optional.of(rate));
    }

    private UploadStatisticsProjection projection(
            long total,
            long processed,
            long pending,
            long qualified,
            long partial,
            long notQualified,
            String amount
    ) {
        BigDecimal totalAmount = amount == null ? null : new BigDecimal(amount);
        return new UploadStatisticsProjection() {
            public long getTotalTransactions() { return total; }
            public long getProcessedTransactions() { return processed; }
            public long getPendingTransactions() { return pending; }
            public long getQualifiedTransactions() { return qualified; }
            public long getPartiallyQualifiedTransactions() { return partial; }
            public long getNotQualifiedTransactions() { return notQualified; }
            public BigDecimal getTotalAmount() { return totalAmount; }
        };
    }

    private User user(UUID id) {
        User user = new User();
        user.setId(id);
        return user;
    }
}
