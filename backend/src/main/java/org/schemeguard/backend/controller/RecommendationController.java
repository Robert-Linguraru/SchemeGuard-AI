package org.schemeguard.backend.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.dto.Recommendation.RecommendationRequest;
import org.schemeguard.backend.dto.Recommendation.RecommendationResponse;
import org.schemeguard.backend.service.RecommendationAgentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/assistant")
@RequiredArgsConstructor
public class RecommendationController {

    private final RecommendationAgentService recommendationAgentService;

    @PostMapping("/recommendations")
    public ResponseEntity<RecommendationResponse> recommend(
            @Valid @RequestBody RecommendationRequest request
    ) {
        if (request.transactionId() == null) {
            return ResponseEntity.badRequest().build();
        }

        return ResponseEntity.ok(
                recommendationAgentService.recommend(request.transactionId(), request.message().trim())
        );
    }
}
