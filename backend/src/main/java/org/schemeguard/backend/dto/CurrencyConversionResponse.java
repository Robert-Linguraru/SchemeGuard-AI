package org.schemeguard.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CurrencyConversionResponse(
        String sourceCurrency,
        String targetCurrency,
        BigDecimal sourceValue,
        BigDecimal targetValue,
        BigDecimal rate,
        LocalDate rateDate
) {
}
