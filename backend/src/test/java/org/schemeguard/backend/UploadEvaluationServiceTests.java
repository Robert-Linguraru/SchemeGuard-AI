package org.schemeguard.backend;

import org.junit.jupiter.api.Test;
import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.entity.enums.TransactionStatus;
import org.schemeguard.backend.repository.TransactionRepository;
import org.schemeguard.backend.repository.csvuploads.UploadRepository;
import org.schemeguard.backend.service.ruleIntepreter.RuleEngine;
import org.schemeguard.backend.service.ruleIntepreter.UploadEvaluationService;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UploadEvaluationServiceTests {

    private final UploadRepository uploadRepository = mock(UploadRepository.class);
    private final TransactionRepository transactionRepository = mock(TransactionRepository.class);
    private final RuleEngine ruleEngine = mock(RuleEngine.class);
    private final UploadEvaluationService service = new UploadEvaluationService(
            uploadRepository,
            transactionRepository,
            ruleEngine
    );

    @Test
    void ownerEvaluatesOnlyNewTransactionsForTheirUpload() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())).thenReturn(true);
        when(transactionRepository.countByUpload_IdAndStatus(uploadId, TransactionStatus.NEW))
                .thenReturn(100L);
        RuleEngine.EvaluationSummary summary = new RuleEngine.EvaluationSummary(
                100, 60, 0, true, "Evaluation completed."
        );
        when(ruleEngine.evaluateUnevaluated(uploadId)).thenReturn(summary);

        assertEquals(summary, service.evaluate(user, uploadId));

        verify(transactionRepository).countByUpload_IdAndStatus(uploadId, TransactionStatus.NEW);
        verify(ruleEngine).evaluateUnevaluated(uploadId);
        verify(uploadRepository, never()).markEvaluatedIfComplete(uploadId);
    }

    @Test
    void anotherUserCannotEvaluateUpload() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())).thenReturn(false);

        assertEquals(
                "UPLOAD_NOT_FOUND",
                assertThrows(
                        org.schemeguard.backend.exception.UploadException.class,
                        () -> service.evaluate(user, uploadId)
                ).getCode()
        );

        verify(transactionRepository, never())
                .countByUpload_IdAndStatus(eq(uploadId), eq(TransactionStatus.NEW));
        verify(ruleEngine, never()).evaluateUnevaluated(uploadId);
    }

    @Test
    void noNewTransactionsAreNotEvaluatedAgain() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())).thenReturn(true);
        when(transactionRepository.countByUpload_IdAndStatus(uploadId, TransactionStatus.NEW))
                .thenReturn(0L);
        when(uploadRepository.markEvaluatedIfComplete(uploadId)).thenReturn(1);

        RuleEngine.EvaluationSummary summary = service.evaluate(user, uploadId);

        assertEquals(0, summary.processed());
        assertEquals(true, summary.wasEvaluated());
        assertEquals(
                "There are no new transactions waiting for evaluation.",
                summary.message()
        );
        verify(ruleEngine, never()).evaluateUnevaluated(uploadId);
        verify(uploadRepository).markEvaluatedIfComplete(uploadId);
    }

    @Test
    void repeatedEvaluationAfterCompletionDoesNotRunRuleEngineAgain() {
        UUID uploadId = UUID.randomUUID();
        User user = user(UUID.randomUUID());
        when(uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())).thenReturn(true);
        when(transactionRepository.countByUpload_IdAndStatus(uploadId, TransactionStatus.NEW))
                .thenReturn(0L);
        when(uploadRepository.markEvaluatedIfComplete(uploadId)).thenReturn(1);

        service.evaluate(user, uploadId);
        service.evaluate(user, uploadId);

        verify(ruleEngine, never()).evaluateUnevaluated(uploadId);
        verify(transactionRepository, org.mockito.Mockito.times(2))
                .countByUpload_IdAndStatus(uploadId, TransactionStatus.NEW);
    }

    private User user(UUID id) {
        User user = new User();
        user.setId(id);
        return user;
    }
}