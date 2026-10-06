package org.schemeguard.backend.dto.csvuploads;

import java.math.BigDecimal;

public record UploadStatisticsResponse(
        long totalTransactions,
        long processedTransactions,
        long pendingTransactions,
        long qualifiedTransactions,
        long partiallyQualifiedTransactions,
        long notQualifiedTransactions,
        BigDecimal totalAmount,
        BigDecimal totalFees,
        BigDecimal qualificationRate
) {
}
