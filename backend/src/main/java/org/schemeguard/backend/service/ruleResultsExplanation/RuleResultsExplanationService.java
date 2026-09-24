package org.schemeguard.backend.service.ruleResultsExplanation;

import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.dto.Explanation.ConditionExplanationDto;
import org.schemeguard.backend.dto.Explanation.RuleResultsExplanationResponse;
import org.schemeguard.backend.entity.QualificationResult;
import org.schemeguard.backend.entity.FeeCalculation;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.ResourceNotFoundException;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.FeeCalculationRepository;
import org.schemeguard.backend.repository.QualificationResultRepository;
import org.schemeguard.backend.repository.TransactionRepository;
import org.schemeguard.backend.repository.UploadRepository;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RuleResultsExplanationService {

    private final QualificationResultRepository qualificationResultRepository;
    private final ConditionExplanationService conditionExplanationService;
    private final UploadRepository uploadRepository;
    private final TransactionRepository transactionRepository;
    private final FeeCalculationRepository feeCalculationRepository;

    @Transactional(readOnly = true)
    public RuleResultsExplanationResponse explain(UUID transactionId, UUID uploadId, User user) {
        if (!uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())) {
            throw new UploadException(
                    HttpStatus.NOT_FOUND,
                    "UPLOAD_NOT_FOUND",
                    "Upload not found."
            );
        }

        if (!transactionRepository.existsByIdAndUpload_Id(transactionId, uploadId)) {
            throw new UploadException(
                    HttpStatus.NOT_FOUND,
                    "TRANSACTION_NOT_FOUND",
                    "Transaction not found in this upload."
            );
        }

        QualificationResult result = qualificationResultRepository
                .findFirstByTransactionIdOrderByEvaluatedAtDescIdDesc(transactionId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No qualification results found for transaction "
                                + transactionId
                ));

                    FeeCalculation fee = feeCalculationRepository
                        .findByQualificationResultId(result.getId())
                        .orElse(null);

        List<ConditionExplanationDto> passedConditions =
                explainConditions(result.getPassedConditions(), true);

        List<ConditionExplanationDto> failedConditions =
                explainConditions(result.getFailedConditions(), false);

        return new RuleResultsExplanationResponse(
            transactionId,
                result.getQualificationStatus(),
                result.getQualificationCategory(),
                result.getRule() == null ? null : result.getRule().getId(),
            result.getRuleVersion(),
            result.getRule() == null ? null : result.getRule().getRuleCode(),
            result.getRule() == null ? null : result.getRule().getRuleName(),
                result.getEvaluatedAt(),
                result.getExplanation(),
                buildSummary(result),
                passedConditions,
            failedConditions,
            fee == null ? null : fee.getInterchangeRate(),
            fee == null ? null : fee.getInterchangeFee(),
            fee == null ? null : fee.getSchemeFee(),
            fee == null ? null : fee.getAcquirerFee(),
            fee == null ? null : fee.getTotalFee(),
            fee == null ? null : fee.getOptimizedFee(),
            fee == null ? null : fee.getPotentialSaving()
        );
    }

    private List<ConditionExplanationDto> explainConditions(
            JsonNode conditions,
            boolean passed
    ) {
        if (conditions == null || !conditions.isArray()) {
            throw new IllegalStateException(
                    "Saved conditions must be a JSON."
            );
        }

        List<ConditionExplanationDto> explanations = new ArrayList<>();

        for (JsonNode condition : conditions) {
            explanations.add(
                    conditionExplanationService.explain(condition, passed)
            );
        }

        return explanations;
    }

    private String buildSummary(QualificationResult result) {
        return switch (result.getQualificationStatus()) {
            case QUALIFIED -> {
                String category = result.getQualificationCategory();

                yield category == null || category.isBlank()
                        ? "The transaction was qualified."
                        : "The transaction was qualified for category %s."
                        .formatted(category);
            }

            case NOT_QUALIFIED -> {
                String summary = "The transaction was not qualified for any rules.";

                if ("FALLBACK".equalsIgnoreCase(result.getQualificationCategory())) {
                    summary += " A fallback interchange rate was applied.";
                }

                yield summary;
            }

            case PARTIALLY_QUALIFIED ->
                    "The transaction is partially qualified.";
        };
    }
}