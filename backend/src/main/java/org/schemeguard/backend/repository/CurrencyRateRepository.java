package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.CurrencyRate;
import org.schemeguard.backend.entity.CurrencyRateId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public interface CurrencyRateRepository extends JpaRepository<CurrencyRate, CurrencyRateId> {
    @Query(value = """
            SELECT currency_code
            FROM (
                SELECT TRIM(source_currency) AS currency_code FROM currency_rates
                UNION
                SELECT TRIM(target_currency) AS currency_code FROM currency_rates
            ) available_currencies
            ORDER BY currency_code
            """, nativeQuery = true)
    List<String> findAvailableCurrencies();

    @Modifying
    @Query(value = """
            INSERT INTO currency_rates (source_currency, target_currency, rate, rate_date, updated_at)
            VALUES (:source, :target, :rate, :rateDate, :updatedAt)
            ON CONFLICT (source_currency, target_currency) DO UPDATE
            SET rate = EXCLUDED.rate, rate_date = EXCLUDED.rate_date, updated_at = EXCLUDED.updated_at
            WHERE currency_rates.rate_date <= EXCLUDED.rate_date
            """, nativeQuery = true)
    int upsert(@Param("source") String source, @Param("target") String target,
               @Param("rate") BigDecimal rate, @Param("rateDate") LocalDate rateDate,
               @Param("updatedAt") LocalDateTime updatedAt);
}
