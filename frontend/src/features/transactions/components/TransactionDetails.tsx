import type { TransactionExplanation } from "../api/transactionExplanationApi";

interface TransactionDetailsProps {
    details?: TransactionExplanation;
    currency?: string;
    onViewRule?: (ruleId: string) => void;
    unevaluated?: boolean;
}

const formatFee = (value: number | string | null, currency: string) =>
    value === null || value === undefined ? "Not available" : `${value} ${currency}`;

const formatRate = (value: number | string | null) =>
    value === null || value === undefined ? "Not available" : `${value}`;

export function TransactionDetails({ details, currency = "", onViewRule, unevaluated = false }: TransactionDetailsProps) {
    if (unevaluated) {
        return (
            <div className="transaction-details transaction-details-empty-state">
                <h3>This transaction has not been evaluated yet.</h3>
                <p>Evaluate the CSV to see qualification details.</p>
            </div>
        );
    }

    if (!details) {
        return null;
    }

    const hasPassed = details.passedConditions.length > 0;
    const hasFailed = details.failedConditions.length > 0;
    const hasRule = Boolean(details.ruleCode || details.ruleName || details.selectedRuleId || details.ruleVersion !== null);

    return (
        <div className="transaction-details">
            <div className="transaction-details-heading">
                <div>
                    <span className="eyebrow">QUALIFICATION DETAILS</span>
                    <h3>{details.summary}</h3>
                </div>
            </div>

            <section className="transaction-details-section">
                <h4>Rule applied</h4>
                {hasRule ? (
                    <div className="transaction-rule-summary">
                        <strong>{details.ruleCode || details.ruleName || details.selectedRuleId}</strong>
                        {details.ruleName && details.ruleName !== details.ruleCode && <span>{details.ruleName}</span>}
                        {details.ruleVersion !== null && <span>v{details.ruleVersion}</span>}
                        <button
                            type="button"
                            className="secondary-button"
                            disabled={!details.selectedRuleId || !onViewRule}
                            onClick={() => details.selectedRuleId && onViewRule?.(details.selectedRuleId)}
                        >
                            View rule
                        </button>
                    </div>
                ) : (
                    <p>No rule was applied.</p>
                )}
            </section>

            {hasPassed && (
                <section className="transaction-details-section">
                    <h4>Passed conditions</h4>
                    <ul>
                        {details.passedConditions.map((condition, index) => <li key={`passed-${index}`}>{condition.explanation}</li>)}
                    </ul>
                </section>
            )}

            {hasFailed && (
                <section className="transaction-details-section">
                    <h4>Failed conditions</h4>
                    <ul>
                        {details.failedConditions.map((condition, index) => <li key={`failed-${index}`}>{condition.explanation}</li>)}
                    </ul>
                </section>
            )}

            {!hasPassed && !hasFailed && (
                <p className="transaction-details-empty">No condition details available.</p>
            )}

            <section className="transaction-details-section">
                <h4>Fee details</h4>
                <dl className="transaction-fee-grid">
                    <div><dt>Interchange rate</dt><dd>{formatRate(details.interchangeRate)}</dd></div>
                    <div><dt>Total fee</dt><dd>{formatFee(details.totalFee, currency)}</dd></div>
                    {details.potentialSaving !== null && <div><dt>Potential saving</dt><dd>{formatFee(details.potentialSaving, currency)}</dd></div>}
                </dl>
            </section>

            {details.originalExplanation && <p className="transaction-details-original">{details.originalExplanation}</p>}
        </div>
    );
}
