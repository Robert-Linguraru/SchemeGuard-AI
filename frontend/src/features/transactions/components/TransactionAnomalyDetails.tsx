import { useEffect, useState } from "react";
import { getUploadOutlierReasons, type AnomalyReason } from "../../uploads/api/uploadsApi";

const rate = (value: number | null) => value === null ? "Not available" :
    `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 5 }).format(value * 100)}%`;

export function TransactionAnomalyDetails({ uploadId, transactionId }: { uploadId: string; transactionId: string }) {
    const [reasons, setReasons] = useState<AnomalyReason[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setReasons(null);
        setError(null);
        void getUploadOutlierReasons(uploadId, transactionId, controller.signal).then((result) => {
            if (!controller.signal.aborted) setReasons(result);
        }).catch((requestError: unknown) => {
            if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "Could not load the outlier explanation.");
        });
        return () => controller.abort();
    }, [uploadId, transactionId, retry]);

    return (
        <section className="transaction-anomaly-details" aria-label="Outlier explanation">
            <h4>Why this transaction is an outlier</h4>
            {error ? <div role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>Retry explanation</button></div>
                : reasons === null ? <p role="status">Loading outlier explanation…</p>
                : reasons.length === 0 ? <p>This result was detected before explanations were saved. Run Detect outliers again to record its reason.</p>
                : reasons.map((reason) => (
                    <div key={reason.type} className="transaction-anomaly-reason">
                        <strong>{reason.type === "OPERATIONAL" ? "Operational review" : reason.type === "RATE_HIGH" ? "↑ Higher interchange rate" : "↓ Lower interchange rate"}</strong>
                        <p>{reason.message}</p>
                        {reason.type === "OPERATIONAL" ? <dl className="transaction-fee-grid">
                            <div><dt>Merchant data</dt><dd>Incomplete</dd></div>
                            <div><dt>Clearing delay</dt><dd>{reason.clearingDelayDays} days</dd></div>
                            <div><dt>Control limit</dt><dd>2 days</dd></div>
                        </dl> : <dl className="transaction-fee-grid">
                            <div><dt>Actual interchange rate</dt><dd>{rate(reason.actualRate)}</dd></div>
                            <div><dt>Expected rate range</dt><dd>{rate(reason.expectedLowerRate)} – {rate(reason.expectedUpperRate)}</dd></div>
                            <div><dt>Comparison group</dt><dd>{reason.peerCount} transactions (including this one)</dd></div>
                        </dl>}
                    </div>
                ))}
        </section>
    );
}
