package org.schemeguard.backend.service;

import org.schemeguard.backend.dto.TransactionPageResponse;
import org.schemeguard.backend.dto.TransactionResponse;
import org.schemeguard.backend.dto.TransactionStatisticsResponse;
import org.schemeguard.backend.entity.QualificationResult;
import org.schemeguard.backend.entity.Transaction;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.QualificationResultRepository;
import org.schemeguard.backend.repository.TransactionRepository;
import org.schemeguard.backend.repository.UploadRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Locale;
import java.util.Set;

@Service
public class TransactionService {

    public static final int DEFAULT_PAGE_SIZE = 50;
    public static final int MAX_PAGE_SIZE = 100;

    private final TransactionRepository transactionRepository;
    private final QualificationResultRepository qualificationResultRepository;
        private final UploadRepository uploadRepository;

    public TransactionService(
            TransactionRepository transactionRepository,
            QualificationResultRepository qualificationResultRepository,
            UploadRepository uploadRepository
    ) {
        this.transactionRepository = transactionRepository;
        this.qualificationResultRepository = qualificationResultRepository;
        this.uploadRepository = uploadRepository;
    }

    @Transactional(readOnly = true)
    public TransactionPageResponse findTransactions(int requestedPage, int requestedSize) {
        Pageable pageable = transactionPageable(requestedPage, requestedSize, "createdAt,desc");
        int page = pageable.getPageNumber();
        int size = pageable.getPageSize();
        Page<Transaction> resultPage = transactionRepository
                .findAllByOrderByCreatedAtDescIdDesc(pageable);

        return toPageResponse(resultPage, page, size);
    }

    @Transactional(readOnly = true)
    public TransactionPageResponse findTransactionsForUpload(
            UUID uploadId,
            UUID userId,
            int requestedPage,
            int requestedSize,
            String search,
            String sort,
            boolean anomaliesOnly
    ) {
        if (!uploadRepository.existsByIdAndUser_Id(uploadId, userId)) {
            throw new UploadException(
                    org.springframework.http.HttpStatus.NOT_FOUND,
                    "UPLOAD_NOT_FOUND",
                    "Upload not found."
            );
        }

        Pageable pageable = transactionPageable(requestedPage, requestedSize, sort);
        int page = pageable.getPageNumber();
        int size = pageable.getPageSize();
        String normalizedSearch = search == null ? "" : search.trim();
        Page<Transaction> resultPage = "anomaly".equals(sortField(sort))
                ? transactionRepository.findUploadTransactionsAnomaliesFirst(
                        uploadId, normalizedSearch, anomaliesOnly, pageable)
                : transactionRepository.findUploadTransactions(
                        uploadId, normalizedSearch, anomaliesOnly, pageable);

        return toPageResponse(resultPage, page, size);
    }

    private TransactionPageResponse toPageResponse(
            Page<Transaction> resultPage,
            int page,
            int size
    ) {

        List<UUID> transactionIds = resultPage.getContent().stream()
                .map(Transaction::getId)
                .toList();
        Map<UUID, QualificationResult> qualifications = latestQualifications(transactionIds);
        List<TransactionResponse> content = resultPage.getContent().stream()
                .map(transaction -> toResponse(transaction, qualifications.get(transaction.getId())))
                .toList();

        return new TransactionPageResponse(
                content,
                page,
                size,
                resultPage.getTotalElements(),
                resultPage.getTotalPages()
        );
    }

    private Pageable transactionPageable(int requestedPage, int requestedSize, String requestedSort) {
        int page = Math.max(requestedPage, 0);
        int size = requestedSize <= 0
                ? DEFAULT_PAGE_SIZE
                : Math.min(requestedSize, MAX_PAGE_SIZE);
        String field = sortField(requestedSort);
        Set<String> allowed = Set.of(
                "createdAt", "externalId", "amount", "status", "merchant",
                "scheme", "cardType", "cardCategory", "channel", "merchantCountry",
                "issuerCountry", "qualificationStatus", "anomaly"
        );
        if (!allowed.contains(field)) {
            field = "createdAt";
        }
        if (field.equals("anomaly")) {
            field = "createdAt";
        }
        String property = switch (field) {
            case "merchant" -> "merchant.name";
            case "scheme" -> "scheme.code";
            default -> field;
        };
        String direction = sortDirection(requestedSort);
        return PageRequest.of(
                page,
                size,
                Sort.by(
                        new Sort.Order(
                                "desc".equals(direction) ? Sort.Direction.DESC : Sort.Direction.ASC,
                                property
                        ),
                        Sort.Order.desc("id")
                )
        );
    }

    /**
     * Keeps the original service API available to existing callers while upload
     * transaction views can use search, sorting, and anomaly filtering.
     */
    @Transactional(readOnly = true)
    public TransactionPageResponse findTransactionsForUpload(
            UUID uploadId,
            UUID userId,
            int requestedPage,
            int requestedSize
    ) {
        return findTransactionsForUpload(
                uploadId,
                userId,
                requestedPage,
                requestedSize,
                "",
                "createdAt,desc",
                false
        );
    }

    private String sortField(String sort) {
        if (sort == null || sort.isBlank()) return "createdAt";
        return sort.split(",", 2)[0].trim();
    }

    private String sortDirection(String sort) {
        if (sort == null || sort.isBlank()) return "desc";
        String[] parts = sort.split(",", 2);
        return parts.length == 2
                ? parts[1].trim().toLowerCase(Locale.ROOT)
                : "desc";
    }

    @Transactional(readOnly = true)
    public TransactionStatisticsResponse getStatistics() {
                BigDecimal totalAmount = transactionRepository.sumAmount();
        return new TransactionStatisticsResponse(
                transactionRepository.count(),
                qualificationResultRepository.countQualifiedTransactions(),
                qualificationResultRepository.countNotQualifiedTransactions(),
                qualificationResultRepository.countPartiallyQualifiedTransactions(),
                qualificationResultRepository.countTransactionsWithoutResult(),
                totalAmount == null
                        ? BigDecimal.ZERO
                        : totalAmount
        );
    }

    private Map<UUID, QualificationResult> latestQualifications(List<UUID> transactionIds) {
        if (transactionIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, QualificationResult> latest = new HashMap<>();
        qualificationResultRepository.findForTransactions(transactionIds)
                .forEach(result -> latest.putIfAbsent(result.getTransaction().getId(), result));
        return latest;
    }

    private TransactionResponse toResponse(
            Transaction transaction,
            QualificationResult qualification
    ) {
        return new TransactionResponse(
                transaction.getId(),
                transaction.getUpload() == null ? null : transaction.getUpload().getId(),
                transaction.getExternalId(),
                transaction.getMerchant().getName(),
                transaction.getScheme().getCode(),
                transaction.getScheme().getName(),
                transaction.getAmount(),
                transaction.getCurrencyCode(),
                transaction.getCardType() == null ? null : transaction.getCardType().name(),
                transaction.getCardCategory() == null ? null : transaction.getCardCategory().name(),
                transaction.getChannel() == null ? null : transaction.getChannel().name(),
                transaction.getIssuerCountry(),
                transaction.getMerchantCountry(),
                transaction.getStatus() == null ? null : transaction.getStatus().name(),
                qualification == null || qualification.getQualificationStatus() == null
                        ? null
                        : qualification.getQualificationStatus().name(),
                qualification == null ? null : qualification.getQualificationCategory(),
                qualification == null ? null : qualification.getExplanation(),
                qualification == null ? null : qualification.getEvaluatedAt(),
                transaction.getAuthorizedAt(),
                transaction.getCreatedAt()
        );
    }
}
