package org.schemeguard.backend.service;

import org.schemeguard.backend.dto.MlTransaction;
import org.schemeguard.backend.dto.AnomalyReason;
import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/** Deterministic implementation of the former ML service's outlier rules. */
@org.springframework.stereotype.Component
public class AnomalyRulesEngine {
    // Bump when policies change so completed jobs are recalculated once.
    public static final String VERSION = "rules-v3-explanations";

    public List<UUID> detect(List<MlTransaction> transactions) {
        return analyze(transactions).keySet().stream().sorted().toList();
    }

    public Map<UUID, List<AnomalyReason>> analyze(List<MlTransaction> transactions) {
        if (transactions.stream().anyMatch(t -> t.interchangeRate() == null)) {
            throw new IllegalArgumentException("Every transaction needs an evaluated interchange rate.");
        }
        Map<UUID, List<AnomalyReason>> outliers = new HashMap<>();
        Map<PeerKey, List<MlTransaction>> peers = transactions.stream()
                .collect(Collectors.groupingBy(this::peerKey));
        for (MlTransaction t : transactions) {
            // Operational control failure independent of the selected fee rule.
            if (Boolean.FALSE.equals(t.merchantDataComplete())
                    && t.clearingDelayDays() != null
                    && t.clearingDelayDays().compareTo(BigDecimal.valueOf(2)) > 0) {
                addReason(outliers, t.id(), new AnomalyReason("OPERATIONAL",
                        "Merchant data is incomplete and clearing took more than the two-day control limit. This is an operational review flag; it does not by itself prove the fee is incorrect.",
                        null, null, null, null, t.clearingDelayDays()));
            }
        }
        for (List<MlTransaction> group : peers.values()) detectRateOutliers(group, outliers);
        return outliers;
    }

    private void detectRateOutliers(List<MlTransaction> group, Map<UUID, List<AnomalyReason>> outliers) {
        if (group.size() < 4) return;
        List<BigDecimal> rates = group.stream().map(t -> t.interchangeRate().stripTrailingZeros()).sorted().toList();
        Map<BigDecimal, Long> counts = rates.stream().collect(Collectors.groupingBy(r -> r, Collectors.counting()));
        var majority = counts.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow();
        // A fixed-rate peer group needs a strong consensus; ties are not anomalies.
        if (majority.getValue() * 4 >= rates.size() * 3) {
            group.stream().filter(t -> t.interchangeRate().compareTo(majority.getKey()) != 0)
                    .forEach(t -> addRateReason(outliers, t, majority.getKey(), majority.getKey(), group.size(),
                            "At least 75% of this comparison group share the expected rate."));
            return;
        }
        BigDecimal q1 = percentile(rates, new BigDecimal("0.25"));
        BigDecimal q3 = percentile(rates, new BigDecimal("0.75"));
        BigDecimal iqr = q3.subtract(q1);
        if (iqr.signum() == 0) return;
        BigDecimal margin = iqr.multiply(new BigDecimal("1.5"));
        BigDecimal lower = q1.subtract(margin), upper = q3.add(margin);
        group.stream().filter(t -> t.interchangeRate().compareTo(lower) < 0
                        || t.interchangeRate().compareTo(upper) > 0)
                .forEach(t -> addRateReason(outliers, t, lower, upper, group.size(),
                        "The expected range uses the group's interquartile spread (1.5 × IQR)."));
    }

    private void addRateReason(Map<UUID, List<AnomalyReason>> outliers, MlTransaction t,
                               BigDecimal lower, BigDecimal upper, int groupSize, String method) {
        boolean high = t.interchangeRate().compareTo(upper) > 0;
        addReason(outliers, t.id(), new AnomalyReason(high ? "RATE_HIGH" : "RATE_LOW",
                "Interchange rate is " + (high ? "higher" : "lower") + " than expected. " + method
                        + " Compared transactions share scheme, currency, card type/category, channel, authentication flags, qualification status/category and applied rule.",
                t.interchangeRate(), lower, upper, groupSize, null));
    }

    private void addReason(Map<UUID, List<AnomalyReason>> outliers, UUID id, AnomalyReason reason) {
        outliers.computeIfAbsent(id, ignored -> new ArrayList<>()).add(reason);
    }

    private BigDecimal percentile(List<BigDecimal> rates, BigDecimal fraction) {
        BigDecimal position = fraction.multiply(BigDecimal.valueOf(rates.size() - 1));
        int lower = position.intValue();
        int upper = Math.min(lower + 1, rates.size() - 1);
        return rates.get(lower).add(rates.get(upper).subtract(rates.get(lower))
                .multiply(position.subtract(BigDecimal.valueOf(lower))));
    }

    private PeerKey peerKey(MlTransaction t) {
        return new PeerKey(t.scheme(), t.currency(), t.cardType(), t.cardCategory(), t.channel(),
                t.threeDsUsed(), t.cvvPresent(), t.qualificationStatus(),
                t.qualificationCategory(), t.ruleCode());
    }

    private record PeerKey(String scheme, String currency, String cardType, String cardCategory,
            String channel, Boolean threeDsUsed, Boolean cvvPresent,
            String qualificationStatus, String qualificationCategory, String ruleCode) {}
}
