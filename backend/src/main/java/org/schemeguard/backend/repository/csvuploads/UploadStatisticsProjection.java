package org.schemeguard.backend.repository.csvuploads;

import java.math.BigDecimal;

public interface UploadStatisticsProjection {
    long getTotalTransactions();
    long getProcessedTransactions();
    long getPendingTransactions();
    long getQualifiedTransactions();
    long getPartiallyQualifiedTransactions();
    long getNotQualifiedTransactions();
    BigDecimal getTotalAmount();
}
