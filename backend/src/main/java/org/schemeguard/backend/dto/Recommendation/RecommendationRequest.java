package org.schemeguard.backend.dto.Recommendation;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record RecommendationRequest(
        UUID uploadId,
        UUID transactionId,
        @NotBlank(message = "Message is required")
        @Size(max = 2000, message = "Message must be at most 2000 characters")
        String message
) {
}
