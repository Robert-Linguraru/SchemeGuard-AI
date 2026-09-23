package org.schemeguard.backend.controller;


import jakarta.validation.Valid;
import org.schemeguard.backend.dto.Explanation.RuleResultsExplanationResponse;
import org.schemeguard.backend.service.ruleResultsExplanation.RuleResultsExplanationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/results")
public class RuleResultsExplanationController {

    private final RuleResultsExplanationService ruleResultsExplanationService;

    @Autowired
    public RuleResultsExplanationController(RuleResultsExplanationService ruleResultsExplanationService) {
        this.ruleResultsExplanationService = ruleResultsExplanationService;
    }

    @GetMapping("/explanation")
    public RuleResultsExplanationResponse getResultsExplanation(
            @Valid @RequestParam UUID transactionId
    ) {
        return ruleResultsExplanationService.explain(transactionId);
    }
}