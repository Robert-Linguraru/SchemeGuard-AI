package org.schemeguard.backend.controller;

import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.service.ruleIntepreter.RuleEngine;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/qualifications")
@RequiredArgsConstructor
public class RuleInterpreterController {
    private final RuleEngine engine;

    @PostMapping("/evaluate")
    public RuleEngine.EvaluationSummary evaluateUnevaluated(
            @RequestParam(name = "file_id") UUID fileId
    ) {
        return engine.evaluateUnevaluated(fileId);
    }
}
