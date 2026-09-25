package org.schemeguard.backend.repository;

import java.math.BigDecimal;

public interface UploadFeeProjection {
    String getCurrency();
    BigDecimal getFee();
    long getTransactionCount();
}
