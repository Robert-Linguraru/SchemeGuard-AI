package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    @EntityGraph(attributePaths = "user")
    @Query(value = """
            SELECT a.* FROM audit_logs a
            WHERE a.entity_type = 'RULE'
              AND (a.old_values ->> 'schemeId' = CAST(:schemeId AS text)
                   OR a.new_values ->> 'schemeId' = CAST(:schemeId AS text))
              AND (a.old_values ->> 'ruleCode' = :ruleCode
                   OR a.new_values ->> 'ruleCode' = :ruleCode)
            ORDER BY a.created_at DESC, a.id DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM audit_logs a
            WHERE a.entity_type = 'RULE'
              AND (a.old_values ->> 'schemeId' = CAST(:schemeId AS text)
                   OR a.new_values ->> 'schemeId' = CAST(:schemeId AS text))
              AND (a.old_values ->> 'ruleCode' = :ruleCode
                   OR a.new_values ->> 'ruleCode' = :ruleCode)
            """,
            nativeQuery = true)
    Page<AuditLog> findRuleHistory(
            @Param("schemeId") UUID schemeId,
            @Param("ruleCode") String ruleCode,
            Pageable pageable
    );
}
