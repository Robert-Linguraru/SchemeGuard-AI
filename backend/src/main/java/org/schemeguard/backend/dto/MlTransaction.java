package org.schemeguard.backend.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record MlTransaction(
        UUID id,
        String externalId,
        String scheme,
        BigDecimal amount,
        String currency,
        String cardType,
        String cardCategory,
        String channel,
        String issuerCountry,
        String merchantCountry,
        Boolean threeDsUsed,
        Boolean cvvPresent,
        Boolean merchantDataComplete,
        BigDecimal clearingDelayDays,
        String qualificationStatus,
        String qualificationCategory,
        String ruleCode,
        BigDecimal interchangeRate
) {
}
