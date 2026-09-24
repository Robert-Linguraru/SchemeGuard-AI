package org.schemeguard.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class CurrencyRateId implements Serializable {

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "source_currency", nullable = false, length = 3, columnDefinition = "char(3)")
    private String sourceCurrency;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "target_currency", nullable = false, length = 3, columnDefinition = "char(3)")
    private String targetCurrency;
}
