package org.schemeguard.backend.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.schemeguard.backend.dto.Rule.RuleDetailsResponseDto;
import org.schemeguard.backend.dto.Rule.RuleListResponseDto;
import org.schemeguard.backend.entity.Rule;

import java.util.List;

@Mapper(componentModel = "spring")
public interface RuleMapper {

    @Mapping(target = "schemeCode", source = "scheme.code")
    @Mapping(target = "schemeName", source = "scheme.name")
    RuleListResponseDto toListResponseDto(Rule rule);

    @Mapping(target = "schemeCode", source = "scheme.code")
    @Mapping(target = "schemeName", source = "scheme.name")
    RuleDetailsResponseDto toDetailsResponseDto(Rule rule);

    List<RuleListResponseDto> toListResponseDtos(Iterable<Rule> rules);
}