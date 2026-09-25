package org.schemeguard.backend.repository;

import org.schemeguard.backend.dto.Analytics.AnalyticsMetricDto;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Repository
public class AnalyticsQueryRepository {
    private static final String FILTERED_CTE = """
            WITH latest_results AS (
                SELECT DISTINCT ON (qr.transaction_id)
                       qr.transaction_id,
                       qr.id AS result_id,
                       qr.qualification_status
                FROM qualification_results qr
                JOIN transactions result_transaction ON result_transaction.id = qr.transaction_id
                JOIN uploads result_upload ON result_upload.id = result_transaction.upload_id
                WHERE result_upload.user_id = :userId
                ORDER BY qr.transaction_id, qr.evaluated_at DESC, qr.id DESC
            ),
            filtered AS (
                SELECT t.amount,
                       t.currency_code,
                       t.status,
                       m.name AS merchant_name,
                       cs.code AS scheme_code,
                       t.merchant_country,
                       lr.qualification_status,
                       CASE
                           WHEN t.currency_code = CAST(:targetCurrency AS text) THEN CAST(1 AS numeric)
                           ELSE cr.rate
                       END AS conversion_rate,
                       t.amount * CASE
                           WHEN t.currency_code = CAST(:targetCurrency AS text) THEN CAST(1 AS numeric)
                           ELSE cr.rate
                       END AS converted_amount,
                       COALESCE(fc.total_fee, CAST(0 AS numeric)) * CASE
                           WHEN t.currency_code = CAST(:targetCurrency AS text) THEN CAST(1 AS numeric)
                           ELSE cr.rate
                       END AS converted_fee
                FROM transactions t
                JOIN uploads u ON u.id = t.upload_id AND u.user_id = :userId
                JOIN merchants m ON m.id = t.merchant_id
                JOIN card_schemes cs ON cs.id = t.scheme_id
                LEFT JOIN latest_results lr ON lr.transaction_id = t.id
                LEFT JOIN fee_calculations fc ON fc.qualification_result_id = lr.result_id
                LEFT JOIN currency_rates cr
                    ON cr.source_currency = t.currency_code
                   AND cr.target_currency = CAST(:targetCurrency AS text)
                WHERE (CAST(:fromInstant AS timestamptz) IS NULL OR t.authorized_at >= CAST(:fromInstant AS timestamptz))
                  AND (CAST(:toInstant AS timestamptz) IS NULL OR t.authorized_at < CAST(:toInstant AS timestamptz))
                  AND (CAST(:scheme AS text) IS NULL OR LOWER(cs.code) = LOWER(CAST(:scheme AS text)))
                  AND (CAST(:country AS text) IS NULL OR LOWER(t.merchant_country) = LOWER(CAST(:country AS text)))
                  AND (CAST(:merchant AS text) IS NULL OR LOWER(m.name) = LOWER(CAST(:merchant AS text)))
                  AND (CAST(:status AS text) IS NULL OR t.status = CAST(:status AS text))
                  AND (
                      CAST(:qualification AS text) IS NULL
                      OR (CAST(:qualification AS text) = 'PENDING' AND lr.transaction_id IS NULL)
                      OR (CAST(:qualification AS text) <> 'PENDING' AND lr.qualification_status = CAST(:qualification AS text))
                  )
            )
            """;

    private static final String SUMMARY_SQL = FILTERED_CTE + """
            SELECT COUNT(*) AS total_transactions,
                   COUNT(*) FILTER (WHERE status = 'PROCESSED') AS processed_transactions,
                   COUNT(*) FILTER (WHERE qualification_status = 'QUALIFIED') AS qualified_transactions,
                   COUNT(*) FILTER (WHERE qualification_status = 'PARTIALLY_QUALIFIED') AS partially_qualified_transactions,
                   COUNT(*) FILTER (WHERE qualification_status = 'NOT_QUALIFIED') AS not_qualified_transactions,
                   COALESCE(SUM(converted_amount), CAST(0 AS numeric)) AS total_amount,
                   COALESCE(SUM(converted_fee), CAST(0 AS numeric)) AS total_fees,
                   COALESCE(AVG(converted_amount), CAST(0 AS numeric)) AS average_transaction_amount,
                   COUNT(*) FILTER (WHERE conversion_rate IS NULL) AS missing_conversion_rates
            FROM filtered
            """;

    private static final String METRICS_SQL = FILTERED_CTE + """
            , metric_rows AS (
                SELECT 'qualification' AS metric_group,
                       COALESCE(qualification_status, 'PENDING') AS name,
                       COUNT(*) AS transactions,
                       CAST(0 AS numeric) AS fees,
                       COUNT(*)::numeric AS sort_value
                FROM filtered
                GROUP BY COALESCE(qualification_status, 'PENDING')

                UNION ALL

                SELECT 'scheme' AS metric_group,
                       scheme_code AS name,
                       COUNT(*) AS transactions,
                       COALESCE(SUM(converted_fee), CAST(0 AS numeric)) AS fees,
                       COUNT(*)::numeric AS sort_value
                FROM filtered
                GROUP BY scheme_code

                UNION ALL

                SELECT 'country' AS metric_group,
                       merchant_country AS name,
                       COUNT(*) AS transactions,
                       CAST(0 AS numeric) AS fees,
                       COUNT(*)::numeric AS sort_value
                FROM filtered
                GROUP BY merchant_country

                UNION ALL

                SELECT 'merchant' AS metric_group,
                       merchant_name AS name,
                       COUNT(*) AS transactions,
                       COALESCE(SUM(converted_fee), CAST(0 AS numeric)) AS fees,
                       COALESCE(SUM(converted_fee), CAST(0 AS numeric)) AS sort_value
                FROM filtered
                GROUP BY merchant_name
            )
            SELECT metric_group, name, transactions, fees
            FROM metric_rows
            ORDER BY metric_group, sort_value DESC, name
            """;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public AnalyticsQueryRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public AnalyticsSummary querySummary(AnalyticsFilter filter) {
        AnalyticsSummary summary = jdbcTemplate.queryForObject(
                SUMMARY_SQL,
                parameters(filter),
                (resultSet, rowNumber) -> new AnalyticsSummary(
                        resultSet.getLong("total_transactions"),
                        resultSet.getLong("processed_transactions"),
                        resultSet.getLong("qualified_transactions"),
                        resultSet.getLong("partially_qualified_transactions"),
                        resultSet.getLong("not_qualified_transactions"),
                        resultSet.getBigDecimal("total_amount"),
                        resultSet.getBigDecimal("total_fees"),
                        resultSet.getBigDecimal("average_transaction_amount"),
                        resultSet.getLong("missing_conversion_rates")
                )
        );

        return summary == null ? AnalyticsSummary.empty() : summary;
    }

    public AnalyticsMetrics queryMetrics(AnalyticsFilter filter) {
        Map<String, List<AnalyticsMetricDto>> grouped = new HashMap<>();
        List<MetricRow> rows = jdbcTemplate.query(
                METRICS_SQL,
                parameters(filter),
                (resultSet, rowNumber) -> new MetricRow(
                        resultSet.getString("metric_group"),
                        resultSet.getString("name"),
                        resultSet.getLong("transactions"),
                        resultSet.getBigDecimal("fees")
                )
        );

        rows.forEach(row -> grouped.computeIfAbsent(row.metricGroup(), ignored -> new ArrayList<>())
                .add(new AnalyticsMetricDto(row.name(), row.transactions(), row.fees())));

        return new AnalyticsMetrics(
                grouped.getOrDefault("qualification", List.of()),
                grouped.getOrDefault("scheme", List.of()),
                grouped.getOrDefault("country", List.of()),
                grouped.getOrDefault("merchant", List.of())
        );
    }

    private MapSqlParameterSource parameters(AnalyticsFilter filter) {
        return new MapSqlParameterSource()
                .addValue("userId", filter.userId())
                .addValue("fromInstant", toTimestamp(filter.from()))
                .addValue("toInstant", toTimestamp(filter.to()))
                .addValue("scheme", filter.scheme())
                .addValue("country", filter.country())
                .addValue("merchant", filter.merchant())
                .addValue("qualification", filter.qualification())
                .addValue("status", filter.status())
                .addValue("targetCurrency", filter.targetCurrency());
    }

    private Timestamp toTimestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    public record AnalyticsFilter(
            UUID userId,
            Instant from,
            Instant to,
            String scheme,
            String country,
            String merchant,
            String qualification,
            String status,
            String targetCurrency
    ) {
    }

    public record AnalyticsSummary(
            long totalTransactions,
            long processedTransactions,
            long qualifiedTransactions,
            long partiallyQualifiedTransactions,
            long notQualifiedTransactions,
            BigDecimal totalAmount,
            BigDecimal totalFees,
            BigDecimal averageTransactionAmount,
            long missingConversionRates
    ) {
        private static AnalyticsSummary empty() {
            return new AnalyticsSummary(0, 0, 0, 0, 0, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0);
        }
    }

    public record AnalyticsMetrics(
            List<AnalyticsMetricDto> qualificationResults,
            List<AnalyticsMetricDto> feesByScheme,
            List<AnalyticsMetricDto> transactionsByCountry,
            List<AnalyticsMetricDto> topMerchantsByFees
    ) {
    }

    private record MetricRow(String metricGroup, String name, long transactions, BigDecimal fees) {
    }
}
