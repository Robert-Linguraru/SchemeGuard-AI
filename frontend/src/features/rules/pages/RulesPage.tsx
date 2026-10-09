import { useEffect, useRef, useState } from "react";
import { deleteRule, getRules } from "../api/rulesApi";
import { getRuleErrorMessage } from "../api/ruleErrors";
import type { RuleListResponse } from "../types/rule";
import { FloatingBackground } from "../../../shared/components/FloatingBackground";
import { App as AntdApp, Button } from "antd";
import { DeleteOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";

interface RulesPageProps {
    onCreateRule: () => void;
    onOpenRule: (id: string) => void;
    successMessage?: string | null;
    onSuccessMessageShown?: () => void;
}

export function RulesPage({
                              onCreateRule,
                              onOpenRule,
                              successMessage,
                              onSuccessMessageShown
                          }: RulesPageProps) {
    const { modal, notification } = AntdApp.useApp();
    const shownSuccessMessage = useRef<string | null>(null);
    const [rules, setRules] = useState<RuleListResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadRules = async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await getRules();
            setRules(result);
        } catch (error) {
            setError(getRuleErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRules();
    }, []);

    useEffect(() => {
        if (!successMessage || shownSuccessMessage.current === successMessage) return;
        shownSuccessMessage.current = successMessage;
        notification.success({
            placement: "topRight",
            message: successMessage
        });
        onSuccessMessageShown?.();
    }, [successMessage, notification, onSuccessMessageShown]);

    const handleDelete = (rule: RuleListResponse) => {
        modal.confirm({
            title: "Delete rule?",
            content: `Permanently delete ${rule.ruleName}? This cannot be undone.`,
            okText: "Delete rule",
            cancelText: "Cancel",
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await deleteRule(rule.id);
                    setRules((currentRules) =>
                        currentRules.filter((currentRule) => currentRule.id !== rule.id)
                    );
                    notification.success({
                        placement: "topRight",
                        message: "Rule deleted",
                        description: `${rule.ruleName} was deleted successfully.`
                    });
                } catch (requestError) {
                    setError(getRuleErrorMessage(requestError));
                }
            }
        });
    };

    return (
        <main className="dashboard rules-page">
            <FloatingBackground />
            <section className="content">
                <div className="page-heading">
                    <div>
                        <p className="eyebrow">RULES WORKSPACE</p>
                        <h2>All rules</h2>
                        <p>View and manage qualification rules.</p>
                    </div>

                    <div className="heading-actions">
                        <Button
                            type="primary"
                            size="large"
                            className="create-rule-button standard-action-size"
                            icon={<PlusOutlined />}
                            onClick={onCreateRule}
                        >
                            Create rule
                        </Button>
                    </div>
                </div>

                {loading && <p>Loading rules...</p>}

                {error && (
                    <div className="form-error" role="alert">
                        {error}
                    </div>
                )}

                {!loading && !error && rules.length === 0 && (
                    <div className="empty-state">
                        No rules found.
                    </div>
                )}

                <div className="rules-list">
                    {rules.map((rule) => (
                        <article className="rule-card" key={rule.id}>
                            <div
                                className="rule-card-content"
                                onClick={() => onOpenRule(rule.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        onOpenRule(rule.id);
                                    }
                                }}
                            >
                                <div className="rule-card-top">
            <span className="rule-code">
                {rule.ruleCode}
            </span>

                                    <span className={rule.active ? "rule-status" : "rule-status inactive"}>
                {rule.active ? "Active" : "Inactive"}
            </span>
                                </div>

                                <h3>{rule.ruleName}</h3>

                                <p className="rule-scheme">
                                    {rule.schemeName} · {rule.schemeCode}
                                </p>

                                <p className="rule-category">
                                    {rule.qualificationCategory} · {rule.region}
                                </p>

                                <div className="rule-card-meta">
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
                                </div>

                                <p className="rule-validity">
                                    Valid from {rule.effectiveFrom}
                                    {rule.effectiveTo
                                        ? ` until ${rule.effectiveTo}`
                                        : " · No end date"}
                                </p>
                            </div>

                            <div className="rule-card-actions">
                                <Button
                                    type="default"
                                    className="view-rule-button"
                                    icon={<SearchOutlined />}
                                    onClick={() => onOpenRule(rule.id)}
                                >
                                    View details
                                </Button>

                                <Button
                                    type="default"
                                    danger
                                    className="danger-button"
                                    icon={<DeleteOutlined />}
                                    onClick={() => handleDelete(rule)}
                                >
                                    Delete
                                </Button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
}
