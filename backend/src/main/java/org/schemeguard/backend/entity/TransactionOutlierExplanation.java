package org.schemeguard.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.schemeguard.backend.dto.AnomalyReason;
import java.util.List;
import java.util.UUID;

@Entity @Table(name = "transaction_outlier_explanations")
@Getter @Setter @NoArgsConstructor
public class TransactionOutlierExplanation {
    @Id @Column(name = "outlier_id")
    private UUID outlierId;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<AnomalyReason> reasons;
}
