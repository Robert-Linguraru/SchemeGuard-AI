package org.schemeguard.backend.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class AnomalyDetectionScheduler {
    private final TransactionAnomalyService anomalyService;
    public AnomalyDetectionScheduler(TransactionAnomalyService anomalyService) { this.anomalyService = anomalyService; }

    @Scheduled(fixedDelayString = "${app.anomaly.poll-interval-ms:1000}")
    public void processQueuedDetection() { anomalyService.processNextPendingJob(); }
}
