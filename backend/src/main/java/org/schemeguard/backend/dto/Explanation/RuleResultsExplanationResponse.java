package org.schemeguard.backend.dto.Explanation;

import org.schemeguard.backend.entity.enums.QualificationStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record RuleResultsExplanationResponse(
        UUID transactionId,
        QualificationStatus qualificationStatus,
        String qualificationCategory,
        UUID selectedRuleId,
        Integer ruleVersion,
        String ruleCode,
        String ruleName,
        Instant evaluatedAt,
        String originalExplanation,
        String summary,
        List<ConditionExplanationDto> passedConditions,
        List<ConditionExplanationDto> failedConditions,
        BigDecimal interchangeRate,
        BigDecimal interchangeFee,
        BigDecimal schemeFee,
        BigDecimal acquirerFee,
        BigDecimal totalFee,
        BigDecimal optimizedFee,
        BigDecimal potentialSaving
) {
}
