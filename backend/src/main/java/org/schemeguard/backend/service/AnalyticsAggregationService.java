package org.schemeguard.backend.service;

import org.schemeguard.backend.dto.Analytics.AnalyticsResponseDto;
import org.schemeguard.backend.entity.enums.TransactionStatus;
import org.schemeguard.backend.exception.CurrencyConversionException;
import org.schemeguard.backend.repository.AnalyticsQueryRepository;
import org.schemeguard.backend.service.currency.CurrencyRateService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class AnalyticsAggregationService {
    private static final String DEFAULT_ANALYTICS_CURRENCY = "EUR";

    private final AnalyticsQueryRepository analyticsQueryRepository;
    private final CurrencyRateService currencyRateService;

    @Autowired
    public AnalyticsAggregationService(
            AnalyticsQueryRepository analyticsQueryRepository,
            CurrencyRateService currencyRateService
    ) {
        this.analyticsQueryRepository = analyticsQueryRepository;
        this.currencyRateService = currencyRateService;
    }

    public AnalyticsAggregationService(AnalyticsQueryRepository analyticsQueryRepository) {
        this(analyticsQueryRepository, null);
    }

    @Transactional(readOnly = true)
    public AnalyticsResponseDto aggregate(
            UUID userId,
            LocalDate from,
            LocalDate to,
            String scheme,
            String country,
            String merchant,
            String qualification,
            TransactionStatus status,
            String targetCurrency
    ) {
        Instant fromInstant = from == null ? null : from.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant toInstant = to == null ? null : to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        String normalizedTargetCurrency = normalizeTargetCurrency(targetCurrency);
        AnalyticsQueryRepository.AnalyticsFilter filter = new AnalyticsQueryRepository.AnalyticsFilter(
                userId,
                fromInstant,
                toInstant,
                normalize(scheme),
                normalize(country),
                normalize(merchant),
                normalize(qualification),
                status == null ? null : status.name(),
                normalizedTargetCurrency
        );
        AnalyticsQueryRepository.AnalyticsSummary summary = analyticsQueryRepository.querySummary(filter);
        if (summary.missingConversionRates() > 0) {
            throw new CurrencyConversionException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "A current conversion rate to " + normalizedTargetCurrency
                            + " is unavailable for one or more transaction currencies."
            );
        }
        AnalyticsQueryRepository.AnalyticsMetrics metrics = analyticsQueryRepository.queryMetrics(filter);
        BigDecimal qualificationRate = summary.totalTransactions() == 0
                ? BigDecimal.ZERO
                : BigDecimal.valueOf(summary.qualifiedTransactions())
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(summary.totalTransactions()), 2, RoundingMode.HALF_UP);

        return new AnalyticsResponseDto(
                normalizedTargetCurrency,
                summary.totalTransactions(),
                summary.processedTransactions(),
                summary.qualifiedTransactions(),
                summary.partiallyQualifiedTransactions(),
                summary.notQualifiedTransactions(),
                summary.totalAmount(),
                summary.totalFees(),
                summary.potentialFeesSaved(),
                summary.averageTransactionAmount().setScale(2, RoundingMode.HALF_UP),
                qualificationRate,
                metrics.qualificationResults(),
                metrics.feesByScheme(),
                metrics.transactionsByCountry(),
                metrics.topMerchantsByFees()
        );
    }

    private String normalizeTargetCurrency(String value) {
        String normalized = value == null || value.isBlank()
                ? DEFAULT_ANALYTICS_CURRENCY
                : value.trim().toUpperCase(Locale.ROOT);
        Set<String> supportedCurrencies = currencyRateService == null
                ? Set.of(DEFAULT_ANALYTICS_CURRENCY)
                : Set.copyOf(currencyRateService.getAvailableCurrencies());
        if (!supportedCurrencies.contains(normalized)) {
            throw new CurrencyConversionException(
                    HttpStatus.BAD_REQUEST,
                    "Analytics does not support target currency " + normalized
                            + " because no conversion rates are configured for it."
            );
        }
        return normalized;
    }

    private String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim().toUpperCase(Locale.ROOT);
    }
}
