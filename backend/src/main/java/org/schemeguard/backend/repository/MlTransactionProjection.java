package org.schemeguard.backend.repository;

import java.math.BigDecimal;
import java.util.UUID;

public interface MlTransactionProjection {
    UUID getId();
    String getExternalId();
    String getScheme();
    BigDecimal getAmount();
    String getCurrency();
    String getCardType();
    String getCardCategory();
    String getChannel();
    String getIssuerCountry();
    String getMerchantCountry();
    Boolean getThreeDsUsed();
    Boolean getCvvPresent();
    Boolean getMerchantDataComplete();
    BigDecimal getClearingDelayDays();
    String getQualificationStatus();
    String getQualificationCategory();
    String getRuleCode();
    BigDecimal getInterchangeRate();
}
