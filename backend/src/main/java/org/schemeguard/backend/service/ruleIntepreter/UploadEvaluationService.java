package org.schemeguard.backend.service.ruleIntepreter;

import org.schemeguard.backend.entity.User;
import org.schemeguard.backend.entity.enums.TransactionStatus;
import org.schemeguard.backend.exception.UploadException;
import org.schemeguard.backend.repository.TransactionRepository;
import org.schemeguard.backend.repository.UploadRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class UploadEvaluationService {

    private final UploadRepository uploadRepository;
    private final TransactionRepository transactionRepository;
    private final RuleEngine ruleEngine;

    public UploadEvaluationService(
            UploadRepository uploadRepository,
            TransactionRepository transactionRepository,
            RuleEngine ruleEngine
    ) {
        this.uploadRepository = uploadRepository;
        this.transactionRepository = transactionRepository;
        this.ruleEngine = ruleEngine;
    }

    @Transactional
    public RuleEngine.EvaluationSummary evaluate(User user, UUID uploadId) {
        if (!uploadRepository.existsByIdAndUser_Id(uploadId, user.getId())) {
            throw new UploadException(
                    HttpStatus.NOT_FOUND,
                    "UPLOAD_NOT_FOUND",
                    "Upload not found."
            );
        }

        long newTransactions = transactionRepository.countByUpload_IdAndStatus(
                uploadId,
                TransactionStatus.NEW
        );
        if (newTransactions == 0) {
            int marked = uploadRepository.markEvaluatedIfComplete(uploadId);
            return new RuleEngine.EvaluationSummary(
                    0,
                    0,
                    0,
                    marked > 0,
                    "There are no new transactions waiting for evaluation."
            );
        }

        return ruleEngine.evaluateUnevaluated(uploadId);
    }
}