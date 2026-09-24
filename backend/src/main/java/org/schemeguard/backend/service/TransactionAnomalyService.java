package org.schemeguard.backend.service;

import org.schemeguard.backend.dto.AnomalyDetectionResponse;
import org.schemeguard.backend.dto.MlTransaction;
import org.schemeguard.backend.entity.TransactionOutlier;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.exception.ConflictException;
import org.schemeguard.backend.exception.ResourceNotFoundException;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.MlTransactionProjection;
import org.schemeguard.backend.repository.TransactionOutlierRepository;
import org.schemeguard.backend.repository.TransactionRepository;
import org.schemeguard.backend.repository.UploadRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.net.http.HttpClient;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class TransactionAnomalyService {

    private final UploadRepository uploadRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionOutlierRepository outlierRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String mlUrl;

    public TransactionAnomalyService(
            UploadRepository uploadRepository,
            TransactionRepository transactionRepository,
            TransactionOutlierRepository outlierRepository,
            ObjectMapper objectMapper,
            @Value("${app.ml.url}") String mlUrl
    ) {
        this.uploadRepository = uploadRepository;
        this.transactionRepository = transactionRepository;
        this.outlierRepository = outlierRepository;
        this.objectMapper = objectMapper;
        this.mlUrl = mlUrl;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Transactional
    public AnomalyDetectionResponse detect(User user, UUID uploadId) {
        var upload = ownedEvaluatedUpload(user, uploadId);
        List<MlTransaction> transactions = transactionRepository
                .findMlTransactionsForUpload(uploadId)
                .stream()
                .map(this::toMlTransaction)
                .toList();

        var requestJson = objectMapper.writeValueAsString(new MlRequest(transactions));
        var request = HttpRequest.newBuilder()
                .uri(URI.create(mlUrl + "/detect-outliers"))
                .timeout(Duration.ofSeconds(120))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestJson, StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> mlResponse;
        try {
            mlResponse = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("The ML request was interrupted", exception);
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("The ML service could not be reached", exception);
        }
        if (mlResponse.statusCode() < 200 || mlResponse.statusCode() >= 300) {
            throw new IllegalStateException("The ML service returned HTTP "
                    + mlResponse.statusCode() + ": " + mlResponse.body());
        }
        var response = objectMapper.readValue(mlResponse.body(), MlResponse.class);

        if (response == null || response.outlierTransactionIds() == null) {
            throw new IllegalStateException("ML service returned an empty anomaly response");
        }

        outlierRepository.deleteAllByUploadId(uploadId);
        var outlierIds = response.outlierTransactionIds().stream()
                .map(UUID::fromString)
                .distinct()
                .toList();
        var transactionMap = transactionRepository.findAllById(outlierIds).stream()
                .collect(java.util.stream.Collectors.toMap(t -> t.getId(), t -> t));
        for (UUID transactionId : outlierIds) {
            var transaction = transactionMap.get(transactionId);
            if (transaction == null || transaction.getUpload() == null
                    || !uploadId.equals(transaction.getUpload().getId())) {
                continue;
            }
            var outlier = new TransactionOutlier();
            outlier.setUpload(upload);
            outlier.setTransaction(transaction);
            outlier.setDetectedAt(Instant.now());
            outlierRepository.save(outlier);
        }
        return new AnomalyDetectionResponse(outlierIds);
    }

    @Transactional(readOnly = true)
    public List<UUID> findOutlierIds(User user, UUID uploadId) {
        ownedUpload(user, uploadId);
        return outlierRepository.findAllByUploadId(uploadId).stream()
                .map(outlier -> outlier.getTransaction().getId())
                .toList();
    }

    @Transactional
    public void confirm(User user, UUID uploadId, UUID transactionId) {
        ownedUpload(user, uploadId);
        var outlier = outlierRepository.findByUploadIdAndTransactionId(uploadId, transactionId)
                .orElseThrow(() -> new ResourceNotFoundException("Transaction is not marked as an outlier"));
        outlier.setManuallyConfirmed(true);
        outlier.setConfirmedAt(Instant.now());
    }

    private org.schemeguard.backend.entity.Upload ownedEvaluatedUpload(User user, UUID uploadId) {
        var upload = ownedUpload(user, uploadId);
        if (!upload.isWasEvaluated()) {
            throw new ConflictException("The upload must be evaluated before detecting outliers.");
        }
        return upload;
    }

    private org.schemeguard.backend.entity.Upload ownedUpload(User user, UUID uploadId) {
        return uploadRepository.findById(uploadId)
                .filter(upload -> upload.getUser().getId().equals(user.getId()))
                .orElseThrow(() -> new UploadException(
                        org.springframework.http.HttpStatus.NOT_FOUND,
                        "UPLOAD_NOT_FOUND",
                        "Upload not found."
                ));
    }

    private MlTransaction toMlTransaction(MlTransactionProjection value) {
        return new MlTransaction(
                value.getId(), value.getExternalId(), value.getScheme(), value.getAmount(),
                value.getCurrency(), value.getCardType(), value.getCardCategory(), value.getChannel(),
                value.getIssuerCountry(), value.getMerchantCountry(), value.getThreeDsUsed(),
                value.getCvvPresent(), value.getMerchantDataComplete(), value.getClearingDelayDays(),
                value.getQualificationStatus(), value.getQualificationCategory(),
                value.getRuleCode(), value.getInterchangeRate()
        );
    }

    private record MlRequest(List<MlTransaction> transactions) {}
    private record MlResponse(List<String> outlierTransactionIds) {}
}
