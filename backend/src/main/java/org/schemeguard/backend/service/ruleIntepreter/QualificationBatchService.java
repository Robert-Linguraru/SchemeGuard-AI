package org.schemeguard.backend.service.ruleIntepreter;

import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.entity.*;
import org.schemeguard.backend.entity.enums.QualificationStatus;
import org.schemeguard.backend.entity.enums.TransactionStatus;
import org.schemeguard.backend.exception.ConflictException;
import org.schemeguard.backend.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;

@Service
@RequiredArgsConstructor
public class QualificationBatchService {
    private final TransactionRepository transactions;
    private final RuleRepository rules;
    private final QualificationResultRepository results;
    private final FeeCalculationRepository fees;

    private final CountryToRegionService countries;
    private final FallbackRateService fallbackRates;

    private final ConditionEvaluator evaluator;
    private final ObjectMapper mapper;

    public record BatchResult(int processed, int qualified, int fallback) {}

    private record RuleLookupKey(UUID schemeId, String region, LocalDate date) {}
    private record FallbackLookupKey(UUID schemeId, String region) {}
    private record EvaluationDecision(
            Transaction transaction,
            String region,
            Rule selectedRule,
            BigDecimal rate,
            List<Map<String, Object>> passedConditions,
            List<Map<String, Object>> failedConditions
    ) {
        private boolean qualified() {
            return selectedRule != null;
        }
    }

    private record BatchCache(
            Map<String, String> regions,
            Map<RuleLookupKey, List<Rule>> rules,
            Map<FallbackLookupKey, BigDecimal> fallbackRates
    ) {
        private BatchCache() {
            this(new HashMap<>(), new HashMap<>(), new HashMap<>());
        }
    }

    @Transactional
    public BatchResult evaluateBatch(Instant cutoff, int batchSize) {
        var batch = transactions.lockUnevaluated(cutoff, batchSize);
        var cache = new BatchCache();
        var decisions = new ArrayList<EvaluationDecision>(batch.size());
        int qualified = 0;

        for (Transaction transaction : batch) {
            var decision = evaluate(transaction, cache);
            decisions.add(decision);
            if (decision.qualified()) qualified++;
        }

        decisions.forEach(this::persist);
        return new BatchResult(batch.size(), qualified, batch.size() - qualified);
    }

    private EvaluationDecision evaluate(Transaction transaction, BatchCache cache) {
        String country = normalizeCountry(transaction.getMerchantCountry());
        String region = cache.regions().computeIfAbsent(country, countries::getRegion);
        UUID schemeId = transaction.getScheme().getId();
        LocalDate date = transaction.getAuthorizedAt().atZone(ZoneOffset.UTC).toLocalDate();
        var ruleKey = new RuleLookupKey(schemeId, region, date);
        var candidates = cache.rules().computeIfAbsent(ruleKey,
                key -> rules.filterApplicableRules(key.schemeId(), key.region(), key.date()));
        List<Map<String, Object>> passed = new ArrayList<>();
        List<Map<String, Object>> failed = new ArrayList<>();
        Rule selected = null;
        for (Rule candidate : candidates) {
            ConditionEvaluator.Evaluation evaluation;
            try {
                evaluation = evaluator.evaluate(transaction, candidate.getConditions());
            } catch (IllegalArgumentException ex) {
                throw new ConflictException("Invalid rule " + candidate.getId() + ": " + ex.getMessage());
            }
            appendTrace(passed, candidate, evaluation.passed());
            appendTrace(failed, candidate, evaluation.failed());
            if (evaluation.matches()) {
                selected = candidate;
                break;
            }
        }
        BigDecimal rate = selected == null
                ? cache.fallbackRates().computeIfAbsent(
                        new FallbackLookupKey(schemeId, region),
                        key -> fallbackRates.getRate(key.schemeId(), key.region()))
                : selected.getInterchangeRate();

        return new EvaluationDecision(transaction, region, selected, rate, passed, failed);
    }

    private void persist(EvaluationDecision decision) {
        Transaction transaction = decision.transaction();
        Rule selected = decision.selectedRule();
        BigDecimal rate = decision.rate();

        QualificationResult result = new QualificationResult();
        result.setTransaction(transaction);
        result.setRule(selected);
        result.setRuleVersion(selected == null ? null : selected.getVersion());
        result.setQualificationStatus(selected == null ? QualificationStatus.NOT_QUALIFIED : QualificationStatus.QUALIFIED);
        result.setQualificationCategory(selected == null ? "FALLBACK" : selected.getQualificationCategory());
        result.setPassedConditions(mapper.valueToTree(decision.passedConditions()));
        result.setFailedConditions(mapper.valueToTree(decision.failedConditions()));
        result.setExplanation(selected == null
                ? "No applicable rule satisfied every condition in merchant region " + decision.region() + "; fallback rate " + rate + " applied."
                : "Rule " + selected.getRuleCode() + " version " + selected.getVersion()
                    + " satisfied every condition; selected by priority, creation time, then rate.");
        results.save(result);

        FeeCalculation fee = new FeeCalculation();
        fee.setQualificationResult(result);
        fee.setInterchangeRate(rate);
        fee.setInterchangeFee(transaction.getAmount().multiply(rate).setScale(4, RoundingMode.HALF_UP));
        fee.setTotalFee(fee.getInterchangeFee());
        fees.save(fee);
        transaction.setStatus(TransactionStatus.PROCESSED);
    }

    private String normalizeCountry(String country) {
        return country == null ? null : country.trim().toUpperCase(Locale.ROOT);
    }

    private void appendTrace(List<Map<String, Object>> target, Rule rule, List<Map<String, Object>> conditions) {
        for (var condition : conditions) {
            Map<String, Object> trace = new LinkedHashMap<>(condition);
            trace.put("ruleId", rule.getId().toString());
            trace.put("ruleVersion", rule.getVersion());
            target.add(trace);
        }
    }
}
