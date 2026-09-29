package org.schemeguard.backend.service.csvUpload;

import org.schemeguard.backend.dto.Upload.UploadStatisticsResponse;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.UploadRepository;
import org.schemeguard.backend.repository.UploadStatisticsProjection;
import org.schemeguard.backend.service.currency.CurrencyRateService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;
import java.util.HashMap;
import java.util.Map;

@Service
public class UploadStatisticsService {

    private final UploadRepository uploadRepository;
    private final CurrencyRateService currencyRateService;

    public UploadStatisticsService(UploadRepository uploadRepository, CurrencyRateService currencyRateService) {
        this.uploadRepository = uploadRepository;
        this.currencyRateService = currencyRateService;
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
                totalFeesInEur(uploadId, user.getId()),
                qualificationRate
        );
    }

    private BigDecimal totalFeesInEur(UUID uploadId, UUID userId) {
        Map<String, BigDecimal> rates = new HashMap<>();
        BigDecimal total = new BigDecimal("0.00");
        for (var group : uploadRepository.findFeeGroupsByIdAndUserId(uploadId, userId)) {
            if (group.getFee().signum() == 0) continue;
            BigDecimal rate = rates.computeIfAbsent(group.getCurrency(), currency ->
                    currencyRateService.convert(currency, "EUR", BigDecimal.ZERO).rate());
            BigDecimal convertedFee = group.getFee().multiply(rate).setScale(2, RoundingMode.HALF_UP);
            total = total.add(convertedFee.multiply(BigDecimal.valueOf(group.getTransactionCount())));
        }
        return total;
    }

    private BigDecimal zeroIfNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
