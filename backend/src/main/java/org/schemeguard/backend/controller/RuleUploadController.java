package org.schemeguard.backend.controller;

import jakarta.validation.Valid;
import org.schemeguard.backend.dto.Rule.RuleDetailsResponseDto;
import org.schemeguard.backend.dto.Rule.RuleListResponseDto;
import org.schemeguard.backend.dto.Rule.RuleHistoryPageDto;
import org.schemeguard.backend.dto.Rule.RuleRequestDto;
import org.schemeguard.backend.entity.Rule;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.mapper.RuleMapper;
import org.schemeguard.backend.service.RuleHistoryService;
import org.schemeguard.backend.service.RuleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

@RestController
@RequestMapping("/api/rule")
public class RuleUploadController {

    private final RuleService ruleService;
    private final RuleMapper ruleMapper;
    private final RuleHistoryService ruleHistoryService;

    @Autowired
    public RuleUploadController(RuleService ruleService,
                                RuleMapper ruleMapper,
                                RuleHistoryService ruleHistoryService) {
        this.ruleService = ruleService;
        this.ruleMapper = ruleMapper;
        this.ruleHistoryService = ruleHistoryService;
    }

    @PostMapping("/upload")
    public ResponseEntity<RuleListResponseDto> uploadRule(
            @Valid @RequestBody RuleRequestDto ruleRequestDto,
            @AuthenticationPrincipal User user
    ) {
        Rule response = ruleService.createRule(ruleRequestDto, user);

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

    @GetMapping("/history")
    public ResponseEntity<RuleHistoryPageDto> getRuleHistory(
            @RequestParam UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(ruleHistoryService.getHistory(id, page, size));
    }

    @PostMapping("/delete")
    public ResponseEntity<Void> deleteRule(
            @RequestParam UUID id,
            @AuthenticationPrincipal User user
    ) {
        ruleService.deleteRule(id, user);

        return ResponseEntity.noContent().build();
    }
}
