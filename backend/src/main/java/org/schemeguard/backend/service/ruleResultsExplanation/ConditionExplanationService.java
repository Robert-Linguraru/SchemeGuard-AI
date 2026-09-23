package org.schemeguard.backend.service.ruleResultsExplanation;

import org.schemeguard.backend.dto.Explanation.ConditionExplanationDto;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.util.Map;
import java.util.UUID;

@Service
public class ConditionExplanationService {
    private static final Map<String, String> FIELDS = Map.ofEntries(
            Map.entry("cardtype", "Card type"),
            Map.entry("cardCategory", "Card category"),
            Map.entry("channel", "Transaction channel"),
            Map.entry("merchantDataComplete", "Merchant data completion status"),
            Map.entry("clearingDelayDays", "Number of days between transaction authorization time and clearing time"),
            Map.entry("threedsUsed", "Use of 3D Secure"),
            Map.entry("cvvPresent", "CVV present")
    );

    private static final Map<String, String> OPERATORS = Map.ofEntries(
            Map.entry("EQUALS", "equals to"),
            Map.entry("NOT_EQUALS", "different from"),
            Map.entry("GREATER_THAN", "greater than"),
            Map.entry("LESS_THAN", "less than"),
            Map.entry("GREATER_OR_EQUAL_THAN", "greater or equal than"),
            Map.entry("LESS_OR_EQUAL_THAN", "less or equal than")
    );

    public ConditionExplanationDto explain(JsonNode condition, boolean passed) {
        String field = condition.get("field").asString();
        String operator = condition.get("operator").asString();

        JsonNode expected = condition.get("expected");
        JsonNode actual = condition.get("actual");

        String fieldLabel = FIELDS.getOrDefault(field, field);
        String operatorLabel = OPERATORS.get(operator);
        String outcome = passed ? "accomplished" : "unaccomplished";

        String actualExplanation = actual.isNull()
                ? "Value missing from transaction."
                : "Registered value: " + formatValue(actual) + ".";

        String requirement = operatorLabel == null
                ? "Unknown operator: " + operator
                + ". Reference value: " + formatValue(expected) + "."
                : "Required value: " + operatorLabel
                + " " + formatValue(expected) + ".";

        String explanation = "%s: condition %s. %s %s".formatted(
                fieldLabel, outcome, actualExplanation, requirement
        );

        return new ConditionExplanationDto(
                explanation
        );
    }

    private String formatValue(JsonNode value) {
        if (value.isBoolean()) {
            return value.asBoolean() ? "yes" : "no";
        }

        if (value.isTextual()) {
            return value.asText();
        }

        return value.toString();
    }
}
