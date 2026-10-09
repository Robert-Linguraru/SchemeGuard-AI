package org.schemeguard.backend.dto.Rule;

import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.UUID;

public record RuleHistoryEventDto(
        UUID id,
        String action,
        Instant createdAt,
        String actorName,
        String actorEmail,
        Integer version,
        JsonNode oldValues,
        JsonNode newValues
) {}
