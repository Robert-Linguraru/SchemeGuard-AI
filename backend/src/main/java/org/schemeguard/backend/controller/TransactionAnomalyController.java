package org.schemeguard.backend.controller;

import org.schemeguard.backend.dto.AnomalyJobResponse;
import org.schemeguard.backend.dto.AnomalyReason;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.service.TransactionAnomalyService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/uploads/{uploadId}/anomalies")
public class TransactionAnomalyController {

    private final TransactionAnomalyService anomalyService;

    public TransactionAnomalyController(TransactionAnomalyService anomalyService) {
        this.anomalyService = anomalyService;
    }

    @PostMapping("/detect")
    public ResponseEntity<AnomalyJobResponse> detect(
            @PathVariable UUID uploadId,
            @AuthenticationPrincipal User user
    ) {
        return ResponseEntity.accepted().body(anomalyService.requestDetection(user, uploadId));
    }

    @GetMapping("/status")
    public ResponseEntity<AnomalyJobResponse> status(
            @PathVariable UUID uploadId,
            @AuthenticationPrincipal User user
    ) {
        return ResponseEntity.ok(anomalyService.getJob(user, uploadId));
    }

    @GetMapping
    public ResponseEntity<List<UUID>> list(
            @PathVariable UUID uploadId,
            @AuthenticationPrincipal User user
    ) {
        return ResponseEntity.ok(anomalyService.findOutlierIds(user, uploadId));
    }

    @GetMapping("/{transactionId}/explanation")
    public ResponseEntity<List<AnomalyReason>> explanation(
            @PathVariable UUID uploadId, @PathVariable UUID transactionId,
            @AuthenticationPrincipal User user) {
        return ResponseEntity.ok(anomalyService.findReasons(user, uploadId, transactionId));
    }

    @PostMapping("/{transactionId}/confirm")
    public ResponseEntity<Void> confirm(
            @PathVariable UUID uploadId,
            @PathVariable UUID transactionId,
            @AuthenticationPrincipal User user
    ) {
        anomalyService.confirm(user, uploadId, transactionId);
        return ResponseEntity.noContent().build();
    }
}
