import { useEffect, useState } from "react";
import { useAuth } from "../../../app/AuthProvider";
import { RuleChangeHistory } from "../components/RuleChangeHistory";
import { deleteRule, getRule } from "../api/rulesApi";
import { getRuleErrorMessage } from "../api/ruleErrors";
import type {
    RuleCondition,
    RuleDetailsResponse
} from "../types/rule";
import { App as AntdApp, Button } from "antd";
import { FloatingBackground } from "../../../shared/components/FloatingBackground";

interface RuleDetailsPageProps {
    ruleId: string;
    onBack: () => void;
    onDeleted: () => void;
}

const labelize = (value: string) =>
    value
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .replace(/^./, (char) => char.toUpperCase());

const formatValue = (value: unknown) => {
    if (typeof value === "boolean") {
        return value ? "Yes" : "No";
    }

    return String(value);
};

export function RuleDetailsPage({
                                    ruleId,
                                    onBack,
                                    onDeleted
                                }: RuleDetailsPageProps) {
    const { modal, notification } = AntdApp.useApp();
    const { user } = useAuth();
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";
    const [rule, setRule] = useState<RuleDetailsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");

    useEffect(() => {
        getRule(ruleId)
            .then(setRule)
            .catch((error) => {
                setError(getRuleErrorMessage(error));
            });
    }, [ruleId]);

    const handleDelete = () => {
        modal.confirm({
            title: "Delete rule?",
            content: `Permanently delete ${rule?.ruleName ?? "this rule"}? This cannot be undone.`,
            okText: "Delete rule",
            cancelText: "Cancel",
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await deleteRule(ruleId);
                    notification.success({
                        placement: "topRight",
                        message: "Rule deleted",
                        description: `${rule?.ruleName ?? "The rule"} was deleted successfully.`
                    });
                    onDeleted();
                } catch (requestError) {
                    setError(getRuleErrorMessage(requestError));
                }
            }
        });
    };

    const conditions: RuleCondition[] = rule?.conditions?.all ?? [];

    return (
        <main className="dashboard rules-page">
            <FloatingBackground />
            <section className="content">
                {isAdmin && (
                <Button
                    type="default"
                    className="page-nav-button"
                    onClick={onBack}
                >
                    Back to rules
                </Button>
                )}

                {error && (
                    <div className="form-error" role="alert">
                        {error}
                    </div>
                )}

                {!rule && !error && (
                    <div className="rule-loading">
                        Loading rule...
                    </div>
                )}

                {rule && (
                    <article className="rule-detail-card">
                        <div className="rule-detail-header">
                            <div>
                                <p className="eyebrow">
                                    {rule.ruleCode}
                                </p>
                                <h2>{rule.ruleName}</h2>
                                <p className="rule-scheme">
                                    {rule.schemeName} · {rule.schemeCode}
                                </p>
                            </div>

                            <span className={
                                      rule.active
                                          ? "rule-status"
                                          : "rule-status inactive"
                                  }>
                                {rule.active ? "Active" : "Inactive"}
                            </span>
                        </div>

                        <div className="rule-detail-tabs" role="tablist" aria-label="Rule details">
                            <button
                                type="button"
                                id="rule-overview-tab"
                                role="tab"
                                aria-controls="rule-overview-panel"
                                aria-selected={activeTab === "overview"}
                                className={activeTab === "overview" ? "active" : ""}
                                onClick={() => setActiveTab("overview")}
                            >
                                Overview
                            </button>
                            <button
                                type="button"
                                id="rule-history-tab"
                                role="tab"
                                aria-controls="rule-history-panel"
                                aria-selected={activeTab === "history"}
                                className={activeTab === "history" ? "active" : ""}
                                onClick={() => setActiveTab("history")}
                            >
                                Change history
                            </button>
                        </div>

                        {activeTab === "overview" ? <div id="rule-overview-panel" aria-labelledby="rule-overview-tab" role="tabpanel" className="rule-detail-tab-panel">
                        <section className="detail-section">
                            <h3>Rule information</h3>

                            <div className="details-grid">
                                <div>
                                    <span>Region</span>
                                    <strong>{rule.region}</strong>
                                </div>

                                <div>
                                    <span>Qualification category</span>
                                    <strong>
                                        {rule.qualificationCategory}
                                    </strong>
                                </div>

                                <div>
                                    <span>Interchange rate</span>
                                    <strong>
                                        {(rule.interchangeRate * 100).toFixed(2)}%
                                    </strong>
                                </div>

                                <div>
                                    <span>Priority</span>
                                    <strong>{rule.priority}</strong>
                                </div>

                                <div>
                                    <span>Version</span>
                                    <strong>v{rule.version}</strong>
                                </div>

                                <div>
                                    <span>Effective period</span>
                                    <strong>
                                        {rule.effectiveFrom}
                                        {rule.effectiveTo
                                            ? ` – ${rule.effectiveTo}`
                                            : " – No end date"}
                                    </strong>
                                </div>

                                <div className="detail-wide">
                                    <span>Rule ID</span>
                                    <strong>{rule.id}</strong>
                                </div>

                                <div className="detail-wide">
                                    <span>Created at</span>
                                    <strong>
                                        {new Date(rule.createdAt).toLocaleString()}
                                    </strong>
                                </div>
                            </div>
                        </section>

                        <section className="detail-section">
                            <h3>Conditions</h3>
                            <p className="field-help">
                                Every condition must be satisfied.
                            </p>

                            <div className="condition-details-list">
                                {conditions.map((condition, index) => (
                                    <div
                                        className="condition-detail-row"
                                        key={`${condition.field}-${index}`}
                                    >
                                        <span className="condition-number">
                                            {index + 1}
                                        </span>

                                        <strong>
                                            {labelize(condition.field)}
                                        </strong>

                                        <span className="condition-operator">
                                            {labelize(condition.operator)}
                                        </span>

                                        <span className="condition-value">
                                            {formatValue(condition.value)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>


                        {isAdmin && (
                            <div className="detail-actions">
                                <Button
                                    type="default"
                                    danger
                                    className="danger-button"
                                    onClick={handleDelete}
                                >
                                Delete rule
                                </Button>
                            </div>
                        )}
                        </div> : <div id="rule-history-panel" aria-labelledby="rule-history-tab" role="tabpanel" className="rule-detail-tab-panel">
                            <RuleChangeHistory ruleId={ruleId} />
                        </div>}
                    </article>
                )}
            </section>
        </main>
    );
}
