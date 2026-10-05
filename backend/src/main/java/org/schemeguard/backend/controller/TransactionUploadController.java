package org.schemeguard.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Hidden;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.dto.Upload.CompleteUploadResponse;
import org.schemeguard.backend.dto.Upload.CreateUploadRequest;
import org.schemeguard.backend.dto.Upload.CreateUploadResponse;
import org.schemeguard.backend.dto.Upload.PartUploadResponse;
import org.schemeguard.backend.dto.Upload.UploadPageResponse;
import org.schemeguard.backend.dto.Upload.UploadStatusResponse;
import org.schemeguard.backend.dto.Upload.UploadStatisticsResponse;
import org.schemeguard.backend.dto.TransactionPageResponse;
import org.schemeguard.backend.service.TransactionService;
import org.schemeguard.backend.service.ruleIntepreter.RuleEngine;
import org.schemeguard.backend.service.ruleIntepreter.UploadEvaluationService;
import org.schemeguard.backend.service.csvUpload.UploadDownloadService;
import org.schemeguard.backend.service.csvUpload.UploadStatisticsService;
import org.schemeguard.backend.service.csvUpload.UploadService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ContentDisposition;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@Hidden // Multipart/chunked upload controller is intentionally excluded from generated OpenAPI.
@RequestMapping("/api/uploads")
public class TransactionUploadController {

    private final UploadService uploadService;
    private final TransactionService transactionService;
        private final UploadEvaluationService uploadEvaluationService;
    private final UploadDownloadService uploadDownloadService;
    private final UploadStatisticsService uploadStatisticsService;

    public TransactionUploadController(
            UploadService uploadService,
            TransactionService transactionService,
            UploadEvaluationService uploadEvaluationService,
            UploadDownloadService uploadDownloadService,
            UploadStatisticsService uploadStatisticsService
    ) {
        this.uploadService = uploadService;
        this.transactionService = transactionService;
        this.uploadEvaluationService = uploadEvaluationService;
        this.uploadDownloadService = uploadDownloadService;
        this.uploadStatisticsService = uploadStatisticsService;
    }

    @PostMapping
    public ResponseEntity<CreateUploadResponse> createUpload(
            @Valid @RequestBody CreateUploadRequest request,
            @AuthenticationPrincipal User user
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(uploadService.createUpload(request, user));
    }

    @GetMapping
    public UploadPageResponse listUploads(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search,
            @AuthenticationPrincipal User user
    ) {
        return uploadService.findUploads(user, page, size, search);
    }

    @GetMapping("/{uploadId}/transactions")
    public TransactionPageResponse listUploadTransactions(
            @PathVariable UUID uploadId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "createdAt,desc") String sort,
            @RequestParam(defaultValue = "false") boolean anomaliesOnly,
            @AuthenticationPrincipal User user
    ) {
        return transactionService.findTransactionsForUpload(
                uploadId,
                user.getId(),
                page,
                size,
                search,
                sort,
                anomaliesOnly
        );
    }

        @PostMapping("/{uploadId}/evaluate")
        public RuleEngine.EvaluationSummary evaluateUpload(
                        @PathVariable UUID uploadId,
                        @AuthenticationPrincipal User user
        ) {
                return uploadEvaluationService.evaluate(user, uploadId);
        }

            @GetMapping("/{uploadId}/download")
            public ResponseEntity<byte[]> downloadUpload(
                @PathVariable UUID uploadId,
                @AuthenticationPrincipal User user
            ) {
            UploadDownloadService.DownloadedUpload download = uploadDownloadService.download(user, uploadId);
            return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv"))
                .header(
                    "Content-Disposition",
                    ContentDisposition.attachment()
                        .filename(download.fileName(), StandardCharsets.UTF_8)
                        .build()
                        .toString()
                )
                .body(download.document());
            }

    @GetMapping("/{uploadId}/statistics")
    public UploadStatisticsResponse getUploadStatistics(
            @PathVariable UUID uploadId,
            @AuthenticationPrincipal User user
    ) {
        return uploadStatisticsService.getStatistics(user, uploadId);
    }

    @PutMapping(
            value = "/{uploadId}/parts/{partNumber}",
            consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE
    )
    public PartUploadResponse uploadPart(
            @PathVariable UUID uploadId,
            @PathVariable int partNumber,
            @RequestHeader(value = "X-Chunk-SHA256", required = false) String clientSha256,
            HttpServletRequest request
    ) throws IOException {
        return uploadService.uploadPart(
                uploadId,
                partNumber,
                request.getInputStream(),
                clientSha256
        );
    }

    @PostMapping("/{uploadId}/complete")
    public CompleteUploadResponse completeUpload(@PathVariable UUID uploadId) {
        return uploadService.completeUpload(uploadId);
    }

    @GetMapping("/{uploadId}")
    public ResponseEntity<UploadStatusResponse> getStatus(@PathVariable UUID uploadId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(uploadService.getStatus(uploadId));
    }

    @DeleteMapping("/{uploadId}")
    public ResponseEntity<Void> cancelUpload(@PathVariable UUID uploadId) {
        uploadService.cancelUpload(uploadId);
        return ResponseEntity.noContent().build();
    }
}
