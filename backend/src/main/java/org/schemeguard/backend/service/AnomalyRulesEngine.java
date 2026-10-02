package org.schemeguard.backend.service;

import org.schemeguard.backend.dto.MlTransaction;
import java.util.*;
import java.util.stream.Collectors;

/** Deterministic implementation of the former ML service's outlier rules. */
@org.springframework.stereotype.Component
public class AnomalyRulesEngine {
    public List<UUID> detect(List<MlTransaction> transactions) {
        Set<UUID> outliers = new HashSet<>();
        Map<PeerKey, List<MlTransaction>> peers = transactions.stream()
                .collect(Collectors.groupingBy(this::peerKey));
        for (MlTransaction t : transactions) {
            if ("NOT_QUALIFIED".equals(t.qualificationStatus())
                    && Boolean.FALSE.equals(t.merchantDataComplete())
                    && t.clearingDelayDays() != null
                    && t.clearingDelayDays().doubleValue() > 2.0) outliers.add(t.id());
        }
        for (List<MlTransaction> group : peers.values()) detectRateOutliers(group, outliers);
        return outliers.stream().sorted().toList();
    }

    private void detectRateOutliers(List<MlTransaction> group, Set<UUID> outliers) {
        if (group.size() < 4) return;
        List<Double> rates = group.stream().map(t -> t.interchangeRate().doubleValue()).sorted().toList();
        double q1 = rates.get((rates.size() - 1) / 4);
        double q3 = rates.get((rates.size() - 1) * 3 / 4);
        double iqr = q3 - q1;
        if (iqr == 0) {
            double median = rates.get(rates.size() / 2);
            if (rates.stream().allMatch(rate -> rate == median)) return;
            Map<Double, Long> counts = rates.stream().collect(Collectors.groupingBy(r -> r, Collectors.counting()));
            double majority = counts.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow().getKey();
            long majorityCount = counts.get(majority);
            if (majorityCount < 2 || majorityCount <= rates.size() / 2.0) return;
            group.stream().filter(t -> t.interchangeRate().doubleValue() != majority)
                    .map(MlTransaction::id).forEach(outliers::add);
            return;
        }
        double lower = q1 - 1.5 * iqr, upper = q3 + 1.5 * iqr;
        group.stream().filter(t -> t.interchangeRate().doubleValue() < lower
                        || t.interchangeRate().doubleValue() > upper)
                .map(MlTransaction::id).forEach(outliers::add);
    }

    private PeerKey peerKey(MlTransaction t) {
        return new PeerKey(t.scheme(), t.currency(), t.cardType(), t.cardCategory(), t.channel(),
                t.threeDsUsed(), t.cvvPresent(), t.merchantCountry(), t.qualificationStatus(),
                t.qualificationCategory(), t.ruleCode());
    }

    private record PeerKey(String scheme, String currency, String cardType, String cardCategory,
            String channel, Boolean threeDsUsed, Boolean cvvPresent, String merchantCountry,
            String qualificationStatus, String qualificationCategory, String ruleCode) {}
}
