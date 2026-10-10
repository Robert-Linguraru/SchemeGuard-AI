package org.schemeguard.backend;

import org.junit.jupiter.api.Test;
import org.schemeguard.backend.dto.MlTransaction;
import org.schemeguard.backend.service.AnomalyRulesEngine;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class AnomalyRulesEngineTests {
    private final AnomalyRulesEngine engine = new AnomalyRulesEngine();

    @Test
    void thousandRowsFindExactlyTwentyInjectedOperationalAnomalies() {
        var rows = new ArrayList<MlTransaction>();
        var expected = new HashSet<UUID>();
        for (int i = 0; i < 1000; i++) {
            boolean anomaly = i % 50 == 0;
            var row = row(i, "0.00300", "NOT_QUALIFIED", "FALLBACK", null,
                    !anomaly, anomaly ? "5" : "2", i % 2 == 0 ? "US" : "DE");
            rows.add(row);
            if (anomaly) expected.add(row.id());
        }
        assertEquals(expected, new HashSet<>(engine.detect(rows)));
        Collections.reverse(rows);
        assertEquals(expected, new HashSet<>(engine.detect(rows)));
    }

    @Test
    void highAndLowRateExceptionsAreDetectedWithoutFragmentingByCountry() {
        var rows = new ArrayList<MlTransaction>();
        for (int i = 0; i < 8; i++) rows.add(normal(i, "0.00300", "US"));
        rows.add(normal(8, "0.00800", "DE"));
        rows.add(normal(9, "0.00100", "RO"));
        assertEquals(Set.of(rows.get(8).id(), rows.get(9).id()), new HashSet<>(engine.detect(rows)));
    }

    @Test
    void LegitimateMinorityQualificationAndFallbackRatesAreNotOutliers() {
        var rows = new ArrayList<MlTransaction>();
        for (int i = 0; i < 96; i++) rows.add(normal(i, "0.00300", "US"));
        for (int i = 96; i < 100; i++) rows.add(row(i, "0.00350", "QUALIFIED", "EU_CREDIT",
                "VISA_EU_CREDIT", true, "1", "FR"));
        assertTrue(engine.detect(rows).isEmpty());
    }

    @Test
    void SmallGroupsAndBalancedRatesDoNotInventAnomalies() {
        assertTrue(engine.detect(List.of(normal(0, "0.003", "US"), normal(1, "0.009", "US"))).isEmpty());
        assertTrue(engine.detect(List.of(normal(0, "0.003", "US"), normal(1, "0.003", "US"),
                normal(2, "0.004", "US"), normal(3, "0.004", "US"))).isEmpty());
    }

    @Test
    void DecimalScaleDoesNotCreateFalseRateDifferences() {
        assertTrue(engine.detect(List.of(normal(0, "0.003", "US"), normal(1, "0.00300", "US"),
                normal(2, "0.0030", "US"), normal(3, "0.003000", "US"))).isEmpty());
    }

    @Test
    void MissingRatesFailClearlyInsteadOfReportingZeroOutliers() {
        assertThrows(IllegalArgumentException.class, () -> engine.detect(List.of(normal(0, null, "US"))));
    }

    private MlTransaction normal(int i, String rate, String country) {
        return row(i, rate, "NOT_QUALIFIED", "FALLBACK", null, true, "2", country);
    }

    @Test
    void explanationRecordsHighRateAndExactExpectedBounds() {
        var rows = List.of(normal(0, "0.003", "US"), normal(1, "0.003", "US"),
                normal(2, "0.003", "US"), normal(3, "0.008", "US"));
        var reason = engine.analyze(rows).get(rows.get(3).id()).getFirst();
        assertEquals("RATE_HIGH", reason.type());
        assertEquals(0, new BigDecimal("0.008").compareTo(reason.actualRate()));
        assertEquals(0, new BigDecimal("0.003").compareTo(reason.expectedLowerRate()));
        assertEquals(reason.expectedLowerRate(), reason.expectedUpperRate());
        assertEquals(4, reason.peerCount());
    }

    @Test
    void bothOperationalAndRateReasonsAreRetained() {
        var candidate = row(3, "0.001", "NOT_QUALIFIED", "FALLBACK", null, false, "5", "US");
        var rows = List.of(normal(0, "0.003", "US"), normal(1, "0.003", "US"), normal(2, "0.003", "US"), candidate);
        var reasons = engine.analyze(rows).get(candidate.id());
        assertEquals(List.of("OPERATIONAL", "RATE_LOW"), reasons.stream().map(r -> r.type()).toList());
        assertEquals(new BigDecimal("5"), reasons.getFirst().clearingDelayDays());
        assertNull(reasons.getFirst().expectedLowerRate());
    }

    private MlTransaction row(int i, String rate, String status, String category, String rule,
                              boolean complete, String delay, String country) {
        return new MlTransaction(new UUID(0, i + 1), "TX-" + i, "VISA", BigDecimal.TEN,
                "EUR", "CREDIT", "CONSUMER", "POS", "FR", country, false, false,
                complete, new BigDecimal(delay), status, category, rule, rate == null ? null : new BigDecimal(rate));
    }
}
