import { useEffect, useState } from "react";
import { Button, Spin } from "antd";
import { getRuleHistory } from "../api/rulesApi";
import { getRuleErrorMessage } from "../api/ruleErrors";
import type { RuleHistoryEvent } from "../types/rule";

const fieldLabels: Record<string, string> = {
    ruleName: "Rule name",
    region: "Region",
    priority: "Priority",
    conditions: "Conditions",
    qualificationCategory: "Qualification category",
    interchangeRate: "Interchange rate",
    effectiveFrom: "Effective from",
    effectiveTo: "Effective to",
    active: "Status"
};

const labelize = (field: string) => fieldLabels[field]
    ?? field.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());

const conditionsSummary = (value: unknown) => {
    if (!value || typeof value !== "object") return String(value ?? "None");
    const conditions = (value as { all?: unknown[] }).all;
    if (!Array.isArray(conditions)) return JSON.stringify(value);
    if (conditions.length === 0) return "No conditions";
    return conditions.map((item) => {
        if (!item || typeof item !== "object") return String(item);
        const condition = item as Record<string, unknown>;
        return `${labelize(String(condition.field ?? "Condition"))} ${labelize(String(condition.operator ?? ""))} ${String(condition.value ?? "")}`.trim();
    }).join("; ");
};

const formatValue = (field: string, value: unknown) => {
    if (field === "conditions") return conditionsSummary(value);
    if (field === "active") return value ? "Active" : "Inactive";
    if (field === "interchangeRate" && typeof value === "number") return `${(value * 100).toFixed(2)}%`;
    if (value === null || value === undefined || value === "") return "Not set";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
};

const eventTitle = (event: RuleHistoryEvent) => {
    switch (event.action) {
        case "CREATED": return `Rule created · v${event.version ?? 1}`;
        case "VERSION_CREATED": return `Version created · v${event.version ?? "?"}`;
        case "DELETED": return "Rule deleted";
        default: return event.action.replaceAll("_", " ").toLowerCase();
    }
};

const eventChanges = (event: RuleHistoryEvent) => {
    const oldValues = event.oldValues ?? {};
    const newValues = event.newValues ?? {};
    const fields = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]
        .filter((field) => !["schemeId", "schemeCode", "ruleCode", "version"].includes(field))
        .filter((field) => JSON.stringify(oldValues[field]) !== JSON.stringify(newValues[field]));

    return fields.map((field) => ({
        field: labelize(field),
        oldValue: formatValue(field, oldValues[field]),
        newValue: formatValue(field, newValues[field]),
        isNew: oldValues[field] === undefined
    }));
};

const formatTimestamp = (value: string) => new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short"
}).format(new Date(value));

interface RuleChangeHistoryProps {
    ruleId: string;
}

export function RuleChangeHistory({ ruleId }: RuleChangeHistoryProps) {
    const [events, setEvents] = useState<RuleHistoryEvent[]>([]);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalEvents, setTotalEvents] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadPage = async (pageToLoad: number, append: boolean) => {
        setError(null);
        if (append) setIsLoadingMore(true);
        else setIsLoading(true);
        try {
            const result = await getRuleHistory(ruleId, pageToLoad);
            setEvents((current) => append ? [...current, ...result.items] : result.items);
            setPage(result.page);
            setTotalPages(result.totalPages);
            setTotalEvents(result.totalElements);
        } catch (requestError) {
            setError(getRuleErrorMessage(requestError));
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    };

    useEffect(() => {
        setEvents([]);
        setPage(0);
        setTotalPages(0);
        setTotalEvents(0);
        void loadPage(0, false);
    }, [ruleId]);

    if (isLoading) {
        return <div className="rule-history-loading"><Spin /><span>Loading change history...</span></div>;
    }

    return (
        <section className="rule-history" aria-label="Rule change history">
            <div className="rule-history-heading">
                <div>
                    <h3>Change history</h3>
                    <p>Versions and changes recorded for this rule.</p>
                </div>
                <span className="rule-history-count">{totalEvents} {totalEvents === 1 ? "event" : "events"}</span>
            </div>

            {error && (
                <div className="rule-history-error" role="alert">
                    <span>{error}</span>
                    <Button size="small" onClick={() => void loadPage(0, false)}>Retry</Button>
                </div>
            )}

            {!error && events.length === 0 && (
                <div className="rule-history-empty">
                    <strong>No change history yet</strong>
                    <span>Changes made from now on will appear here.</span>
                </div>
            )}

            <div className="rule-history-timeline">
                {events.map((event) => {
                    const changes = eventChanges(event);
                    return (
                        <article className="rule-history-event" key={event.id}>
                            <span className="rule-history-marker" aria-hidden="true" />
                            <div className="rule-history-event-content">
                                <div className="rule-history-event-heading">
                                    <strong>{eventTitle(event)}</strong>
                                    <time dateTime={event.createdAt}>{formatTimestamp(event.createdAt)}</time>
                                </div>
                                <p className="rule-history-actor">{event.actorName}{event.actorEmail ? ` · ${event.actorEmail}` : ""}</p>
                                {changes.length > 0 ? (
                                    <dl className="rule-history-diff">
                                        {changes.map((change) => (
                                            <div className="rule-history-diff-row" key={change.field}>
                                                <dt>{change.field}</dt>
                                                <dd>
                                                    {change.isNew
                                                        ? <span className="rule-history-added">{change.newValue}</span>
                                                        : <><span className="rule-history-removed">{change.oldValue}</span><span className="rule-history-arrow">→</span><span className="rule-history-added">{change.newValue}</span></>}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                ) : (
                                    <p className="rule-history-no-diff">{event.action === "CREATED" ? "Initial rule version recorded." : "No field-level changes."}</p>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>

            {page + 1 < totalPages && (
                <Button className="rule-history-more" loading={isLoadingMore} onClick={() => void loadPage(page + 1, true)}>
                    Load earlier changes
                </Button>
            )}
        </section>
    );
}
