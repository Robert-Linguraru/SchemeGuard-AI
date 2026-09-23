package org.schemeguard.backend.dto.Explanation;

import org.schemeguard.backend.entity.enums.QualificationStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record RuleResultsExplanationResponse(
        QualificationStatus qualificationStatus,
        String qualificationCategory,
        UUID selectedRuleId,
        Instant evaluatedAt,
        String originalExplanation,
        String summary,
        List<ConditionExplanationDto> passedConditions,
        List<ConditionExplanationDto> failedConditions
) {
}
