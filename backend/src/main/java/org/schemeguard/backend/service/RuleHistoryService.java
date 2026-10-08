package org.schemeguard.backend.service;

import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.dto.Rule.RuleHistoryEventDto;
import org.schemeguard.backend.dto.Rule.RuleHistoryPageDto;
import org.schemeguard.backend.entity.AuditLog;
import org.schemeguard.backend.entity.Rule;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.ResourceNotFoundException;
import org.schemeguard.backend.repository.AuditLogRepository;
import org.schemeguard.backend.repository.RuleRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class RuleHistoryService {

    private final AuditLogRepository auditLogRepository;
    private final RuleRepository ruleRepository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public RuleHistoryPageDto getHistory(java.util.UUID ruleId, int page, int size) {
        Rule rule = ruleRepository.findById(ruleId)
                .orElseThrow(() -> new ResourceNotFoundException("Rule not found"));
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(size, 100));
        Page<AuditLog> history = auditLogRepository.findRuleHistory(
                rule.getScheme().getId(),
                rule.getRuleCode(),
                PageRequest.of(safePage, safeSize)
        );

        return new RuleHistoryPageDto(
                history.getContent().stream().map(this::toEventDto).toList(),
                history.getNumber(),
                history.getSize(),
                history.getTotalElements(),
                history.getTotalPages()
        );
    }

    public void recordCreated(Rule rule, Rule previousVersion, User actor) {
        AuditLog event = new AuditLog();
        event.setUser(actor);
        event.setAction(previousVersion == null ? "CREATED" : "VERSION_CREATED");
        event.setEntityType("RULE");
        event.setEntityId(rule.getId());
        event.setOldValues(previousVersion == null ? null : snapshot(previousVersion));
        event.setNewValues(snapshot(rule));
        auditLogRepository.save(event);
    }

    public void recordDeleted(Rule rule, User actor) {
        AuditLog event = new AuditLog();
        event.setUser(actor);
        event.setAction("DELETED");
        event.setEntityType("RULE");
        event.setEntityId(rule.getId());
        event.setOldValues(snapshot(rule));
        auditLogRepository.save(event);
    }

    private JsonNode snapshot(Rule rule) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("schemeId", rule.getScheme().getId());
        values.put("schemeCode", rule.getScheme().getCode());
        values.put("ruleCode", rule.getRuleCode());
        values.put("ruleName", rule.getRuleName());
        values.put("region", rule.getRegion());
        values.put("priority", rule.getPriority());
        values.put("conditions", rule.getConditions());
        values.put("qualificationCategory", rule.getQualificationCategory());
        values.put("interchangeRate", rule.getInterchangeRate());
        values.put("effectiveFrom", rule.getEffectiveFrom().toString());
        values.put("effectiveTo", rule.getEffectiveTo() == null ? null : rule.getEffectiveTo().toString());
        values.put("version", rule.getVersion());
        values.put("active", rule.getActive());
        return objectMapper.valueToTree(values);
    }

    private RuleHistoryEventDto toEventDto(AuditLog event) {
        User actor = event.getUser();
        JsonNode currentValues = event.getNewValues() != null
                ? event.getNewValues()
                : event.getOldValues();
        int version = currentValues == null ? 0 : currentValues.path("version").asInt();
        return new RuleHistoryEventDto(
                event.getId(),
                event.getAction(),
                event.getCreatedAt(),
                actor == null ? "Former user" : actor.getFullName(),
                actor == null ? null : actor.getEmail(),
                version == 0 ? null : version,
                event.getOldValues(),
                event.getNewValues()
        );
    }
}
