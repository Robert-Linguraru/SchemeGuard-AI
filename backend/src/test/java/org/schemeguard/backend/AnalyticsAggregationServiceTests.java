package org.schemeguard.backend;

import org.junit.jupiter.api.Test;
import org.schemeguard.backend.dto.Analytics.AnalyticsMetricDto;
import org.schemeguard.backend.dto.Analytics.AnalyticsResponseDto;
import org.schemeguard.backend.entity.enums.TransactionStatus;
import org.schemeguard.backend.exception.CurrencyConversionException;
import org.schemeguard.backend.repository.AnalyticsQueryRepository;
import org.schemeguard.backend.service.AnalyticsAggregationService;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AnalyticsAggregationServiceTests {

    private final AnalyticsQueryRepository repository = mock(AnalyticsQueryRepository.class);
    private final AnalyticsAggregationService service = new AnalyticsAggregationService(repository);

    @Test
    void analyticsNormalizesAndReturnsEurAsTheTargetCurrency() {
        when(repository.querySummary(any())).thenReturn(summary(0));
        when(repository.queryMetrics(any())).thenReturn(metrics());

        AnalyticsResponseDto response = service.aggregate(
                UUID.randomUUID(), null, null, null, null, null, null, null, " eur "
        );

        assertEquals("EUR", response.currency());
        verify(repository).queryMetrics(any());
    }

    @Test
    void analyticsRejectsTargetCurrenciesNotEnabledYet() {
        CurrencyConversionException exception = assertThrows(
                CurrencyConversionException.class,
                () -> service.aggregate(
                        UUID.randomUUID(), null, null, null, null, null, null, null, "RON"
                )
        );

        assertEquals(400, exception.getStatus().value());
        verify(repository, never()).querySummary(any());
    }

    @Test
    void analyticsFailsInsteadOfReturningPartialTotalsWhenAConversionRateIsMissing() {
        when(repository.querySummary(any())).thenReturn(summary(1));

        CurrencyConversionException exception = assertThrows(
                CurrencyConversionException.class,
                () -> service.aggregate(
                        UUID.randomUUID(), null, null, null, null, null, null, null, "EUR"
                )
        );

        assertEquals(503, exception.getStatus().value());
        verify(repository, never()).queryMetrics(any());
    }

    private AnalyticsQueryRepository.AnalyticsSummary summary(long missingRates) {
        return new AnalyticsQueryRepository.AnalyticsSummary(
                2,
                2,
                1,
                0,
                0,
                new BigDecimal("100.00"),
                new BigDecimal("2.00"),
                new BigDecimal("0.25"),
                new BigDecimal("50.00"),
                missingRates
        );
    }

    private AnalyticsQueryRepository.AnalyticsMetrics metrics() {
        List<AnalyticsMetricDto> empty = List.of();
        return new AnalyticsQueryRepository.AnalyticsMetrics(empty, empty, empty, empty);
    }
}
