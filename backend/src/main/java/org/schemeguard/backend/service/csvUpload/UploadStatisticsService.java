package org.schemeguard.backend.service.csvUpload;

import org.schemeguard.backend.dto.Upload.UploadStatisticsResponse;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.UploadRepository;
import org.schemeguard.backend.repository.UploadStatisticsProjection;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

@Service
public class UploadStatisticsService {

    private final UploadRepository uploadRepository;

    public UploadStatisticsService(UploadRepository uploadRepository) {
        this.uploadRepository = uploadRepository;
    }

    @Transactional(readOnly = true)
    public UploadStatisticsResponse getStatistics(User user, UUID uploadId) {
        UploadStatisticsProjection statistics = uploadRepository.findStatisticsByIdAndUserId(
                        uploadId,
                        user.getId()
                )
                .orElseThrow(() -> new UploadException(
                        HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload not found."
                ));

        BigDecimal processed = BigDecimal.valueOf(statistics.getProcessedTransactions());
        BigDecimal qualificationRate = processed.signum() == 0
                ? BigDecimal.ZERO
                : BigDecimal.valueOf(statistics.getQualifiedTransactions())
                        .divide(processed, 6, RoundingMode.HALF_UP);

        return new UploadStatisticsResponse(
                statistics.getTotalTransactions(),
                statistics.getProcessedTransactions(),
                statistics.getPendingTransactions(),
                statistics.getQualifiedTransactions(),
                statistics.getPartiallyQualifiedTransactions(),
                statistics.getNotQualifiedTransactions(),
                zeroIfNull(statistics.getTotalAmount()),
                zeroIfNull(statistics.getTotalFees()),
                qualificationRate
        );
    }

    private BigDecimal zeroIfNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}