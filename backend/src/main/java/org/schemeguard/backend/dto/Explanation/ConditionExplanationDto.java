package org.schemeguard.backend.dto.Explanation;

import tools.jackson.databind.JsonNode;

import java.util.UUID;

public record ConditionExplanationDto(
        String explanation
) {
}
