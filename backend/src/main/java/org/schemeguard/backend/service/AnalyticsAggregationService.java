package org.schemeguard.backend.service;

import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.dto.Analytics.AnalyticsResponseDto;
import org.schemeguard.backend.entity.enums.TransactionStatus;
import org.schemeguard.backend.repository.AnalyticsQueryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AnalyticsAggregationService {
    private final AnalyticsQueryRepository analyticsQueryRepository;

    @Transactional(readOnly = true)
    public AnalyticsResponseDto aggregate(UUID userId, LocalDate from, LocalDate to, String scheme, String country, String merchant, String qualification, TransactionStatus status) {
        Instant fromInstant = from == null ? null : from.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant toInstant = to == null ? null : to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        AnalyticsQueryRepository.AnalyticsFilter filter = new AnalyticsQueryRepository.AnalyticsFilter(
                userId,
                fromInstant,
                toInstant,
                normalize(scheme),
                normalize(country),
                normalize(merchant),
                normalize(qualification),
                status == null ? null : status.name()
        );
        AnalyticsQueryRepository.AnalyticsSummary summary = analyticsQueryRepository.querySummary(filter);
        AnalyticsQueryRepository.AnalyticsMetrics metrics = analyticsQueryRepository.queryMetrics(filter);
        BigDecimal qualificationRate = summary.totalTransactions() == 0
                ? BigDecimal.ZERO
                : BigDecimal.valueOf(summary.qualifiedTransactions())
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(summary.totalTransactions()), 2, RoundingMode.HALF_UP);

        return new AnalyticsResponseDto(
                summary.totalTransactions(),
                summary.processedTransactions(),
                summary.qualifiedTransactions(),
                summary.partiallyQualifiedTransactions(),
                summary.notQualifiedTransactions(),
                summary.totalAmount(),
                summary.totalFees(),
                summary.averageTransactionAmount().setScale(2, RoundingMode.HALF_UP),
                qualificationRate,
                metrics.qualificationResults(),
                metrics.feesByScheme(),
                metrics.transactionsByCountry(),
                metrics.topMerchantsByFees()
        );
    }

    private String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim().toUpperCase(Locale.ROOT);
    }
}
