package org.schemeguard.backend;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.schemeguard.backend.entity.CardScheme;
import org.schemeguard.backend.entity.FeeCalculation;
import org.schemeguard.backend.entity.QualificationResult;
import org.schemeguard.backend.entity.Rule;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.FeeCalculationRepository;
import org.schemeguard.backend.repository.QualificationResultRepository;
import org.schemeguard.backend.repository.TransactionRepository;
import org.schemeguard.backend.repository.UploadRepository;
import org.schemeguard.backend.service.ruleResultsExplanation.ConditionExplanationService;
import org.schemeguard.backend.service.ruleResultsExplanation.RuleResultsExplanationService;
import tools.jackson.databind.node.JsonNodeFactory;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RuleResultsExplanationServiceTests {

    private final QualificationResultRepository resultRepository = mock(QualificationResultRepository.class);
    private final UploadRepository uploadRepository = mock(UploadRepository.class);
    private final TransactionRepository transactionRepository = mock(TransactionRepository.class);
    private final FeeCalculationRepository feeRepository = mock(FeeCalculationRepository.class);
    private final User user = new User();
    private final UUID uploadId = UUID.randomUUID();
    private final UUID transactionId = UUID.randomUUID();
    private RuleResultsExplanationService service;

    @BeforeEach
    void setUp() {
        service = new RuleResultsExplanationService(
                resultRepository,
                new ConditionExplanationService(),
                uploadRepository,
                transactionRepository,
                feeRepository
        );
        user.setId(UUID.randomUUID());
    }

    @Test
    void returnsLatestQualificationRuleConditionsAndFeesForOwnedUpload() {
        QualificationResult result = qualificationResult();
        FeeCalculation fee = new FeeCalculation();
        fee.setInterchangeRate(new BigDecimal("0.00300"));
        fee.setInterchangeFee(new BigDecimal("0.4200"));
        fee.setSchemeFee(new BigDecimal("0.0100"));
        fee.setAcquirerFee(new BigDecimal("0.0200"));
        fee.setTotalFee(new BigDecimal("0.4500"));
        fee.setOptimizedFee(new BigDecimal("0.3000"));
        fee.setPotentialSaving(new BigDecimal("0.1500"));

        when(uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())).thenReturn(true);
        when(transactionRepository.existsByIdAndUpload_Id(transactionId, uploadId)).thenReturn(true);
        when(resultRepository.findFirstByTransactionIdOrderByEvaluatedAtDescIdDesc(transactionId))
                .thenReturn(Optional.of(result));
        when(feeRepository.findByQualificationResultId(result.getId())).thenReturn(Optional.of(fee));

        var response = service.explain(transactionId, uploadId, user);

        assertEquals(transactionId, response.transactionId());
        assertEquals(result.getRule().getId(), response.selectedRuleId());
        assertEquals(3, response.ruleVersion());
        assertEquals("RULE-001", response.ruleCode());
        assertEquals("Consumer rule", response.ruleName());
        assertEquals("Rule RULE-001 version 3 satisfied every condition.", response.originalExplanation());
        assertEquals(1, response.passedConditions().size());
        assertEquals(1, response.failedConditions().size());
        assertEquals(new BigDecimal("0.4500"), response.totalFee());
        assertEquals(new BigDecimal("0.1500"), response.potentialSaving());
    }

    @Test
    void rejectsTransactionFromAnotherUpload() {
        when(uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())).thenReturn(true);
        when(transactionRepository.existsByIdAndUpload_Id(transactionId, uploadId)).thenReturn(false);

        UploadException exception = assertThrows(
                UploadException.class,
                () -> service.explain(transactionId, uploadId, user)
        );

        assertEquals("TRANSACTION_NOT_FOUND", exception.getCode());
    }

    @Test
    void rejectsUploadOwnedByAnotherUser() {
        when(uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())).thenReturn(false);

        UploadException exception = assertThrows(
                UploadException.class,
                () -> service.explain(transactionId, uploadId, user)
        );

        assertEquals("UPLOAD_NOT_FOUND", exception.getCode());
    }

    @Test
    void returnsNullableRuleAndFeeFieldsForFallbackResult() {
        QualificationResult result = qualificationResult();
        result.setRule(null);
        result.setRuleVersion(null);
        when(uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())).thenReturn(true);
        when(transactionRepository.existsByIdAndUpload_Id(transactionId, uploadId)).thenReturn(true);
        when(resultRepository.findFirstByTransactionIdOrderByEvaluatedAtDescIdDesc(transactionId))
                .thenReturn(Optional.of(result));
        when(feeRepository.findByQualificationResultId(result.getId())).thenReturn(Optional.empty());

        var response = service.explain(transactionId, uploadId, user);

        assertNull(response.selectedRuleId());
        assertNull(response.ruleVersion());
        assertNull(response.ruleCode());
        assertNull(response.ruleName());
        assertNull(response.totalFee());
    }

    private QualificationResult qualificationResult() {
        Rule rule = new Rule();
        rule.setId(UUID.randomUUID());
        rule.setRuleCode("RULE-001");
        rule.setRuleName("Consumer rule");
        rule.setVersion(3);

        QualificationResult result = new QualificationResult();
        result.setId(UUID.randomUUID());
        result.setRule(rule);
        result.setRuleVersion(3);
        result.setQualificationStatus(org.schemeguard.backend.entity.enums.QualificationStatus.QUALIFIED);
        result.setQualificationCategory("EU_POS");
        result.setExplanation("Rule RULE-001 version 3 satisfied every condition.");
        result.setEvaluatedAt(Instant.parse("2026-09-23T10:00:00Z"));
        result.setPassedConditions(JsonNodeFactory.instance.arrayNode().add(
                JsonNodeFactory.instance.objectNode()
                        .put("field", "cardtype")
                        .put("operator", "EQUALS")
                        .put("expected", "CREDIT")
                        .put("actual", "CREDIT")
        ));
        result.setFailedConditions(JsonNodeFactory.instance.arrayNode().add(
                JsonNodeFactory.instance.objectNode()
                        .put("field", "cvvPresent")
                        .put("operator", "EQUALS")
                        .put("expected", true)
                        .put("actual", false)
        ));
        return result;
    }
}
