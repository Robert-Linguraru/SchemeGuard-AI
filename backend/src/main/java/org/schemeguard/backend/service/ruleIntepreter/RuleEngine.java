package org.schemeguard.backend.service.ruleIntepreter;

import lombok.RequiredArgsConstructor;
import org.schemeguard.backend.repository.UploadRepository;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RuleEngine {
    private final QualificationBatchService batches;
    private final UploadRepository uploads;
        public record EvaluationSummary(
            long processed,
            long qualified,
            long fallback,
            boolean wasEvaluated,
            String message
        ) {}

    private final int batchSize = 1000;

    public EvaluationSummary evaluateUnevaluated(UUID fileId) {
        Instant cutoff = Instant.now();
        long processed = 0, qualified = 0, fallback = 0;
        while (true) {
            var batch = batches.evaluateBatch(cutoff, batchSize, fileId);
            processed += batch.processed();
            qualified += batch.qualified();
            fallback += batch.fallback();
            if (batch.processed() == 0) {
                boolean wasEvaluated = uploads.markEvaluatedIfComplete(fileId) > 0;
                return new EvaluationSummary(
                    processed,
                    qualified,
                    fallback,
                    wasEvaluated,
                    processed == 0
                        ? "There are no new transactions waiting for evaluation."
                        : "Evaluation completed."
                );
            }
        }
    }
}
