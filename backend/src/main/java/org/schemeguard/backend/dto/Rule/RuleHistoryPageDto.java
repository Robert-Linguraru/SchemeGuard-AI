package org.schemeguard.backend.dto.Rule;

import java.util.List;

public record RuleHistoryPageDto(
        List<RuleHistoryEventDto> items,
        int page,
        int size,
        long totalElements,
        int totalPages
) {}
