package org.schemeguard.backend;

import org.junit.jupiter.api.Test;
import org.schemeguard.backend.entity.*;
import org.schemeguard.backend.entity.enums.AnomalyJobStatus;
import org.schemeguard.backend.repository.*;
import org.schemeguard.backend.service.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TransactionAnomalyServiceTests {
    private final UploadRepository uploads = mock(UploadRepository.class);
    private final TransactionRepository transactions = mock(TransactionRepository.class);
    private final TransactionOutlierRepository outliers = mock(TransactionOutlierRepository.class);
    private final AnomalyDetectionJobRepository jobs = mock(AnomalyDetectionJobRepository.class);
    private final AnomalyDetectionInputRepository inputs = mock(AnomalyDetectionInputRepository.class);
    private final AnomalyRulesEngine engine = mock(AnomalyRulesEngine.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final TransactionAnomalyService service = new TransactionAnomalyService(
            uploads, transactions, outliers, jobs, engine, inputs, manager);
    private final UUID uploadId = UUID.randomUUID();
    private final User user = new User();
    private final AnomalyDetectionJob job = new AnomalyDetectionJob();

    private void completedJob(String cache) {
        Upload upload = new Upload();
        upload.setId(uploadId);
        upload.setWasEvaluated(true);
        job.setId(UUID.randomUUID());
        job.setUpload(upload);
        job.setStatus(AnomalyJobStatus.COMPLETED);
        var input = new AnomalyDetectionInput();
        input.setJobId(job.getId());
        input.setFingerprint(cache);
        when(uploads.lockForAnomalyDetection(eq(uploadId), any())).thenReturn(Optional.of(upload));
        when(jobs.findByUpload_Id(uploadId)).thenReturn(Optional.of(job));
        when(inputs.findById(job.getId())).thenReturn(Optional.of(input));
        when(transactions.anomalyInputFingerprint(uploadId)).thenReturn("current-input");
    }

    @Test
    void completedUnchangedJobIsReusedWithoutCalculation() {
        completedJob(AnomalyRulesEngine.VERSION + ":current-input");
        assertEquals(AnomalyJobStatus.COMPLETED, service.requestDetection(user, uploadId).status());
        verifyNoInteractions(engine, outliers);
        verify(inputs, never()).save(any());
    }

    @Test
    void outdatedDetectorOrChangedInputQueuesANewRun() {
        completedJob("rules-v1:current-input");
        assertEquals(AnomalyJobStatus.PENDING, service.requestDetection(user, uploadId).status());
        verifyNoInteractions(engine, outliers);
        verify(inputs).save(any());
    }

    @Test
    void processingFailureIsRecordedAfterRollbackAndLeavesOldResultsIntact() {
        completedJob("old-input");
        job.setStatus(AnomalyJobStatus.PENDING);
        when(manager.getTransaction(any())).thenAnswer(ignored -> new SimpleTransactionStatus());
        when(jobs.lockNextJob(any())).thenReturn(Optional.of(job));
        when(jobs.lockById(job.getId())).thenReturn(Optional.of(job));
        when(transactions.findMlTransactionsForUpload(uploadId)).thenThrow(new IllegalStateException("Database read failed"));
        assertTrue(service.processNextPendingJob());
        assertEquals(AnomalyJobStatus.FAILED, job.getStatus());
        assertEquals("Database read failed", job.getErrorMessage());
        verify(manager).rollback(any());
        verify(manager, times(2)).commit(any());
        verifyNoInteractions(outliers, engine);
    }
}
