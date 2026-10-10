package org.schemeguard.backend.dto;

import java.math.BigDecimal;

public record AnomalyReason(String type, String message, BigDecimal actualRate,
        BigDecimal expectedLowerRate, BigDecimal expectedUpperRate, Integer peerCount,
        BigDecimal clearingDelayDays) {}
