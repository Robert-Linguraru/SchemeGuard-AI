package org.schemeguard.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "currency_rates")
@Getter
@Setter
@NoArgsConstructor
public class CurrencyRate {

    @EmbeddedId
    private CurrencyRateId id;

    @Column(nullable = false, precision = 20, scale = 10)
    private BigDecimal rate;

    @Column(name = "rate_date", nullable = false)
    private LocalDate rateDate;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
