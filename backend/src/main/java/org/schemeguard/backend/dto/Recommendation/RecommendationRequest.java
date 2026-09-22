package org.schemeguard.backend.dto.Recommendation;

import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

public record RecommendationRequest(
        UUID transactionId,
        @NotBlank(message = "Message is required") String message
) {
}
