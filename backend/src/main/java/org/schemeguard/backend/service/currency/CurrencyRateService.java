package org.schemeguard.backend.service.currency;

import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.dto.CurrencyConversionResponse;
import org.schemeguard.backend.dto.FrankfurterRateResponse;
import org.schemeguard.backend.entity.CurrencyRateId;
import org.schemeguard.backend.exception.CurrencyConversionException;
import org.schemeguard.backend.repository.CurrencyRateRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;
import java.util.Locale;
import java.util.List;
import java.util.TreeSet;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Service
@RequiredArgsConstructor
public class CurrencyRateService {

    private final CurrencyRateRepository repository;

    @Transactional(readOnly = true)
    public List<String> getAvailableCurrencies() {
        var currencies = new TreeSet<>(repository.findAvailableCurrencies());
        currencies.add("EUR");
        return List.copyOf(currencies);
    }

    @Transactional
    public int saveRates(List<FrankfurterRateResponse> rates) {
        LocalDateTime updatedAt = LocalDateTime.now(ZoneOffset.UTC);
        int updated = 0;
        for (var entry : rates) {
            if (entry.rate() == null || entry.rate().signum() <= 0
                    || entry.date() == null || entry.date().isAfter(updatedAt.toLocalDate())) {
                throw new IllegalArgumentException("Invalid Frankfurter rate: " + entry);
            }
            BigDecimal rate = entry.rate().setScale(10, RoundingMode.HALF_UP);
            if (rate.signum() <= 0 || rate.precision() > 20) {
                throw new IllegalArgumentException("Rate does not fit DECIMAL(20,10): " + entry);
            }
            updated += repository.upsert(entry.base(), entry.quote(), rate, entry.date(), updatedAt);
        }
        return updated;
    }

    @Transactional(readOnly = true)
    public CurrencyConversionResponse convert(String sourceCurrency, String targetCurrency, BigDecimal sourceValue) {
        Currency source = currency(sourceCurrency);
        Currency target = currency(targetCurrency);
        if (sourceValue == null || sourceValue.signum() < 0
                || sourceValue.scale() > 10 || sourceValue.precision() - (long) sourceValue.scale() > 20) {
            throw new CurrencyConversionException(HttpStatus.BAD_REQUEST,
                    "The sum must be nonnegative, with at most 20 integer digits and 10 decimal places.");
        }

        if (source.equals(target)) {
            return new CurrencyConversionResponse(source.getCurrencyCode(), target.getCurrencyCode(),
                    sourceValue, sourceValue.setScale(target.getDefaultFractionDigits(), RoundingMode.HALF_UP),
                    BigDecimal.ONE, null);
        }

        var rate = repository.findById(new CurrencyRateId(source.getCurrencyCode(), target.getCurrencyCode()))
                .orElseThrow(() -> new CurrencyConversionException(HttpStatus.NOT_FOUND,
                        "No rate for %s/%s.".formatted(source.getCurrencyCode(), target.getCurrencyCode())));
        if (rate.getRate() == null || rate.getRate().signum() <= 0) {
            throw new CurrencyConversionException(HttpStatus.SERVICE_UNAVAILABLE, "The saved rate is invalid.");
        }

        BigDecimal targetValue = sourceValue.multiply(rate.getRate())
                .setScale(target.getDefaultFractionDigits(), RoundingMode.HALF_UP);
        return new CurrencyConversionResponse(source.getCurrencyCode(), target.getCurrencyCode(),
                sourceValue, targetValue, rate.getRate(), rate.getRateDate());
    }

    private Currency currency(String code) {
        try {
            Currency currency = Currency.getInstance(code == null ? "" : code.trim().toUpperCase(Locale.ROOT));
            if (currency.getDefaultFractionDigits() < 0) throw new IllegalArgumentException();
            return currency;
        } catch (IllegalArgumentException ex) {
            throw new CurrencyConversionException(HttpStatus.BAD_REQUEST, "Currency code invalid: " + code);
        }
    }
}
