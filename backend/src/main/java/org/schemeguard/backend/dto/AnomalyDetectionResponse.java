package org.schemeguard.backend.dto;

import java.util.List;
import java.util.UUID;

public record AnomalyDetectionResponse(List<UUID> outlierTransactionIds) {
}
