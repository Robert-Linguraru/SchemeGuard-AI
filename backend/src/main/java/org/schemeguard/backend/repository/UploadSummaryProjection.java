package org.schemeguard.backend.repository;

import java.time.Instant;
import java.util.UUID;

public interface UploadSummaryProjection {

    UUID getId();

    String getFileName();

    Instant getUploadedAt();

    String getImportStatus();

    long getTransactionCount();

    long getNewTransactionCount();
}