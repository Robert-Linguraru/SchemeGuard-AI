package org.schemeguard.backend.service.ruleResultsExplanation;

import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.dto.Explanation.ConditionExplanationDto;
import org.schemeguard.backend.dto.Explanation.RuleResultsExplanationResponse;
import org.schemeguard.backend.entity.QualificationResult;
import org.schemeguard.backend.exception.ResourceNotFoundException;
import org.schemeguard.backend.repository.QualificationResultRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RuleResultsExplanationService {

    private final QualificationResultRepository qualificationResultRepository;
    private final ConditionExplanationService conditionExplanationService;

    @Transactional(readOnly = true)
    public RuleResultsExplanationResponse explain(UUID transactionId) {
        QualificationResult result = qualificationResultRepository
                .findFirstByTransactionIdOrderByEvaluatedAtDescIdDesc(transactionId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No qualification results found for transaction "
                                + transactionId
                ));

        List<ConditionExplanationDto> passedConditions =
                explainConditions(result.getPassedConditions(), true);

        List<ConditionExplanationDto> failedConditions =
                explainConditions(result.getFailedConditions(), false);

        return new RuleResultsExplanationResponse(
                result.getQualificationStatus(),
                result.getQualificationCategory(),
                result.getRule() == null ? null : result.getRule().getId(),
                result.getEvaluatedAt(),
                result.getExplanation(),
                buildSummary(result),
                passedConditions,
                failedConditions
        );
    }

    private List<ConditionExplanationDto> explainConditions(
            JsonNode conditions,
            boolean passed
    ) {
        if (conditions == null || !conditions.isArray()) {
            throw new IllegalStateException(
                    "Saved conditions must be a JSON."
            );
        }

        List<ConditionExplanationDto> explanations = new ArrayList<>();

        for (JsonNode condition : conditions) {
            explanations.add(
                    conditionExplanationService.explain(condition, passed)
            );
        }

        return explanations;
    }

    private String buildSummary(QualificationResult result) {
        return switch (result.getQualificationStatus()) {
            case QUALIFIED -> {
                String category = result.getQualificationCategory();

                yield category == null || category.isBlank()
                        ? "The transaction was qualified."
                        : "The transaction was qualified for category %s."
                        .formatted(category);
            }

            case NOT_QUALIFIED -> {
                String summary = "The transaction was not qualified for any rules.";

                if ("FALLBACK".equalsIgnoreCase(result.getQualificationCategory())) {
                    summary += " A fallback interchange rate was applied.";
                }

                yield summary;
            }

            case PARTIALLY_QUALIFIED ->
                    "The transaction is partially qualified.";
        };
    }
}