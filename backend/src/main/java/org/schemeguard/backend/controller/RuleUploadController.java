package org.schemeguard.backend.controller;

import jakarta.validation.Valid;
import org.schemeguard.backend.dto.Rule.RuleDetailsResponseDto;
import org.schemeguard.backend.dto.Rule.RuleListResponseDto;
import org.schemeguard.backend.dto.Rule.RuleRequestDto;
import org.schemeguard.backend.entity.Rule;
import org.schemeguard.backend.mapper.RuleMapper;
import org.schemeguard.backend.service.RuleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

@RestController
@RequestMapping("/api/rule")
public class RuleUploadController {

    private final RuleService ruleService;
    private final RuleMapper ruleMapper;

    @Autowired
    public RuleUploadController(RuleService ruleService,
                                RuleMapper ruleMapper) {
        this.ruleService = ruleService;
        this.ruleMapper = ruleMapper;
    }

    @PostMapping("/upload")
    public ResponseEntity<RuleListResponseDto> uploadRule(
            @Valid @RequestBody RuleRequestDto ruleRequestDto
    ) {
        Rule response = ruleService.createRule(ruleRequestDto);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ruleMapper.toListResponseDto(response));
    }

    @GetMapping("/getRule")
    public ResponseEntity<RuleDetailsResponseDto> getRule(
            @RequestParam UUID id
    ) {
        Rule response = ruleService.getRuleById(id);

        return ResponseEntity.ok(ruleMapper.toDetailsResponseDto(response));
    }

    @GetMapping("/getRules")
    public ResponseEntity<List<RuleListResponseDto>> getRules() {
        var rules = ruleService.getAllRules();

        List<RuleListResponseDto> response = ruleMapper.toListResponseDtos(rules);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/delete")
    public ResponseEntity<Void> deleteRule(
            @RequestParam UUID id
    ) {
        ruleService.deleteRule(id);

        return ResponseEntity.noContent().build();
    }
}
