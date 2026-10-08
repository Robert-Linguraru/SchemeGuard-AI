package org.schemeguard.backend.repository.csvuploads;

import java.time.Instant;
import java.util.UUID;

public interface UploadSummaryProjection {

    UUID getId();

    UUID getSessionId();

    String getFileName();

    String getSourceName();

    Instant getUploadedAt();

    String getImportStatus();

    boolean getWasEvaluated();

    long getTransactionCount();

    long getDuplicateRows();

    long getNewTransactionCount();
}
