package org.schemeguard.backend.dto;

import org.schemeguard.backend.entity.enums.AnomalyJobStatus;
import java.util.UUID;

public record AnomalyJobResponse(UUID jobId, UUID uploadId, AnomalyJobStatus status, String errorMessage) {}
