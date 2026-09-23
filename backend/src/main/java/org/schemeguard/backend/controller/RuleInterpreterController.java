package org.schemeguard.backend.controller;

import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.service.ruleIntepreter.RuleEngine;
import org.schemeguard.backend.service.ruleIntepreter.UploadEvaluationService;
import org.schemeguard.backend.entity.User;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/qualifications")
@RequiredArgsConstructor
public class RuleInterpreterController {
    private final UploadEvaluationService uploadEvaluationService;

    @PostMapping("/evaluate")
    public RuleEngine.EvaluationSummary evaluateUnevaluated(
            @RequestParam(name = "file_id") UUID fileId,
            @AuthenticationPrincipal User user
    ) {
        return uploadEvaluationService.evaluate(user, fileId);
    }
}
