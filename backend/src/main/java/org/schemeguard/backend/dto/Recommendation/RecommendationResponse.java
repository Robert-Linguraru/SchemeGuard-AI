package org.schemeguard.backend.dto.Recommendation;

import java.util.UUID;

public record RecommendationResponse(
        UUID transactionId,
        String externalId,
        String qualificationStatus,
        String message
) {
}
