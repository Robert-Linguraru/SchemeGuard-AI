import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { CloseOutlined, FilterOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, DatePicker, Select, Space, Tooltip } from "antd";
import { useAuth } from "../../../app/AuthProvider";
import { AccountMenu } from "../../../shared/components/AccountMenu";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { LoadingState } from "../../../shared/components/LoadingState";
import { getAnalytics, type AnalyticsFilters, type AnalyticsMetric, type AnalyticsResponse } from "../api/analyticsApi";

interface AnalysisDashboardPageProps {
    onBack: () => void;
    onEditProfile: () => void;
}

type Filters = AnalyticsFilters;

const emptyFilters: Filters = { from: "", to: "", scheme: "", country: "", merchant: "", qualification: "", status: "" };
const label = (value: string) => value.replaceAll("_", " ");
const filterKeys = Object.keys(emptyFilters) as Array<keyof Filters>;

const filtersMatch = (left: Filters, right: Filters) =>
    filterKeys.every((key) => left[key] === right[key]);

const formatDateTime = (value: string | Date | null | undefined): string => {
    if (!value) return "Not available";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return new Intl.DateTimeFormat("ro-RO", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
};

const formatExportTimestamp = (date: Date): string => date.toISOString().replace(/[:.]/g, "-");
const csvCell = (value: string | number | null | undefined): string =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;

function BarList({ items, valueLabel, useFees = false }: { items: AnalyticsMetric[]; valueLabel: string; useFees?: boolean }) {
    const values = items.map((item) => useFees ? Number(item.fees) : item.transactions);
    const max = Math.max(...values, 1);
    if (!items.length) return <p className="analysis-empty">No data for the selected filters.</p>;
    return (
        <div className="analysis-bars">
            {items.slice(0, 6).map((item, index) => {
                const value = values[index];
                return <div className="analysis-bar-row" key={item.name}>
                    <span>{label(item.name)}</span>
                    <div className="analysis-bar-track"><i style={{ width: `${(value / max) * 100}%` }} /></div>
                    <strong>{useFees ? `${value.toFixed(2)} EUR` : value}</strong>
                </div>;
            })}
            <small className="analysis-chart-caption">{valueLabel}</small>
        </div>
    );
}

export function AnalysisDashboardPage({ onBack, onEditProfile }: AnalysisDashboardPageProps) {
    const { user } = useAuth();
    const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
    const [filters, setFilters] = useState<Filters>(emptyFilters);
    const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const analyticsRequestRef = useRef<AbortController | null>(null);
    const [requestWasCancelled, setRequestWasCancelled] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();
        analyticsRequestRef.current = controller;

        setIsLoading(true);
        setError(null);

        getAnalytics(appliedFilters, controller.signal)
            .then((loadedAnalytics) => {
                if (isMounted) setAnalytics(loadedAnalytics);
            })
            .catch((requestError: unknown) => {
                if (isMounted && !controller.signal.aborted) {
                    setError(requestError instanceof Error ? requestError.message : "Could not load analytics");
                }
            })
            .finally(() => {
                if (isMounted && analyticsRequestRef.current === controller) {
                    analyticsRequestRef.current = null;
                    if (!controller.signal.aborted) setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
            controller.abort();
            if (analyticsRequestRef.current === controller) {
                analyticsRequestRef.current = null;
            }
        };
    }, [appliedFilters]);

    const options = useMemo(() => ({
        schemes: analytics?.feesByScheme.map((metric) => metric.name).sort() || [],
        countries: analytics?.transactionsByCountry.map((metric) => metric.name).sort() || [],
        merchants: analytics?.topMerchantsByFees.map((metric) => metric.name).sort() || []
    }), [analytics]);
    const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
    const hasPendingFilterChanges = requestWasCancelled || !filtersMatch(filters, appliedFilters);
    const hasFilterValues = filterKeys.some((key) => Boolean(filters[key]) || Boolean(appliedFilters[key]));
    const applyFilters = () => {
        if (!hasPendingFilterChanges) return;
        setRequestWasCancelled(false);
        setAppliedFilters({ ...filters });
    };
    const resetFilters = () => {
        setFilters({ ...emptyFilters });
        setRequestWasCancelled(false);
        setAppliedFilters({ ...emptyFilters });
    };
    const cancelAnalyticsRequest = () => {
        const controller = analyticsRequestRef.current;
        if (!controller) return;

        controller.abort();
        analyticsRequestRef.current = null;
        setIsLoading(false);
        setRequestWasCancelled(true);
    };

    const exportCsv = () => {
        if (!analytics) return;
        const appliedFilterRows = filterKeys.map((key) => [
            key,
            appliedFilters[key] || "No filter applied"
        ]);
        const metricRows = (title: string, items: AnalyticsMetric[]) => [
            [title, "Transactions", "Fees"],
            ...items.map((item) => [item.name, item.transactions, item.fees])
        ];
        const csvRows: Array<Array<string | number | null>> = [
            ["SchemeGuard AI analytics export"],
            ["Exported at", formatDateTime(new Date())],
            [],
            ["Applied filters", "Value"],
            ...appliedFilterRows,
            [],
            ["Statistics", "Value"],
            ["Total transactions", analytics.totalTransactions],
            ["Processed transactions", analytics.processedTransactions],
            ["Qualified transactions", analytics.qualifiedTransactions],
            ["Partially qualified transactions", analytics.partiallyQualifiedTransactions],
            ["Not qualified transactions", analytics.notQualifiedTransactions],
            ["Total amount", analytics.totalAmount],
            ["Total fees", analytics.totalFees],
            ["Average transaction amount", analytics.averageTransactionAmount],
            ["Qualification rate", `${analytics.qualificationRate}%`],
            [],
            ...metricRows("Qualification results", analytics.qualificationResults),
            [],
            ...metricRows("Fees by scheme", analytics.feesByScheme),
            [],
            ...metricRows("Transactions by country", analytics.transactionsByCountry),
            [],
            ...metricRows("Top merchants by fees", analytics.topMerchantsByFees)
        ];
        const csv = `\uFEFF${csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `schemeguard-analysis-${formatExportTimestamp(new Date())}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <main className="dashboard analysis-dashboard">
            <div className="brand-decoration" aria-hidden="true"><span className="orb orb-blue orb-one"></span><span className="orb orb-coral orb-two"></span><span className="orb orb-white orb-three"></span><span className="orb orb-blue orb-four"></span></div>
            <header className="dashboard-header">
                <div className="welcome"><h1>SchemeGuard AI</h1><p>Welcome, {user?.fullName}</p></div>
                <div className="dashboard-account-actions"><AccountMenu onEditProfile={onEditProfile} /></div>
            </header>
            <section className="content">
                <div className="page-heading analysis-heading">
                    <div><p className="eyebrow">ANALYSIS DASHBOARD</p><h2>Descriptive statistics</h2><p>Explore qualification results, fees and transaction distribution.</p></div>
                    <div className="page-heading-actions"><button type="button" className="secondary-button page-nav-button" onClick={onBack}>CSV uploads</button><button type="button" className="create-rule-button" onClick={exportCsv} disabled={!analytics?.totalTransactions}>Export CSV</button></div>
                </div>
                <section className="analysis-filter-panel" aria-label="Dashboard filters">
                    <div className="analysis-filter-header">
                        <div className="analysis-filter-title">
                            <FilterOutlined />
                            <div>
                                <strong>Filters</strong>
                                <span>Apply filters to update the dashboard, or reset to show all results.</span>
                            </div>
                        </div>
                        <Space wrap size="small">
                            <Button type="primary" icon={<FilterOutlined />} onClick={applyFilters} disabled={!hasPendingFilterChanges || isLoading}>
                                Apply filters
                            </Button>
                            {isLoading && (
                                <Tooltip title="Cancel request">
                                    <Button danger shape="circle" icon={<CloseOutlined />} onClick={cancelAnalyticsRequest} aria-label="Cancel analytics request" />
                                </Tooltip>
                            )}
                            <Button icon={<ReloadOutlined />} onClick={resetFilters} disabled={!hasFilterValues || isLoading}>
                                Reset filters
                            </Button>
                        </Space>
                    </div>
                    <div className="analysis-filter-grid">
                        <div className="analysis-filter-field">
                            <span>From</span>
                            <DatePicker
                                value={filters.from ? dayjs(filters.from) : null}
                                format="YYYY-MM-DD"
                                placeholder="Start date"
                                onChange={(date) => setFilter("from", date ? date.format("YYYY-MM-DD") : "")}
                            />
                        </div>
                        <div className="analysis-filter-field">
                            <span>To</span>
                            <DatePicker
                                value={filters.to ? dayjs(filters.to) : null}
                                format="YYYY-MM-DD"
                                placeholder="End date"
                                onChange={(date) => setFilter("to", date ? date.format("YYYY-MM-DD") : "")}
                            />
                        </div>
                        <div className="analysis-filter-field">
                            <span>Scheme</span>
                            <Select
                                allowClear
                                value={filters.scheme || undefined}
                                placeholder="All schemes"
                                options={options.schemes.map((value) => ({ value, label: value }))}
                                onChange={(value) => setFilter("scheme", value ?? "")}
                            />
                        </div>
                        <div className="analysis-filter-field">
                            <span>Country</span>
                            <Select
                                allowClear
                                value={filters.country || undefined}
                                placeholder="All countries"
                                options={options.countries.map((value) => ({ value, label: value }))}
                                onChange={(value) => setFilter("country", value ?? "")}
                            />
                        </div>
                        <div className="analysis-filter-field">
                            <span>Merchant</span>
                            <Select
                                allowClear
                                value={filters.merchant || undefined}
                                placeholder="All merchants"
                                options={options.merchants.map((value) => ({ value, label: value }))}
                                onChange={(value) => setFilter("merchant", value ?? "")}
                            />
                        </div>
                        <div className="analysis-filter-field">
                            <span>Qualification</span>
                            <Select
                                allowClear
                                value={filters.qualification || undefined}
                                placeholder="All results"
                                options={[
                                    { value: "QUALIFIED", label: "Qualified" },
                                    { value: "PARTIALLY_QUALIFIED", label: "Partially qualified" },
                                    { value: "NOT_QUALIFIED", label: "Not qualified" },
                                    { value: "PENDING", label: "Pending" }
                                ]}
                                onChange={(value) => setFilter("qualification", value ?? "")}
                            />
                        </div>
                        <div className="analysis-filter-field">
                            <span>Status</span>
                            <Select
                                allowClear
                                value={filters.status || undefined}
                                placeholder="All statuses"
                                options={[
                                    { value: "NEW", label: "New" },
                                    { value: "PROCESSED", label: "Processed" },
                                    { value: "FAILED", label: "Failed" }
                                ]}
                                onChange={(value) => setFilter("status", value ?? "")}
                            />
                        </div>
                    </div>
                </section>
                {isLoading && <LoadingState message="Loading analytics..." />}
                {error && <ErrorMessage title="Unable to load analytics" message={error} />}
                {!isLoading && !error && !analytics && <p className="analysis-empty">Analytics request was cancelled. Apply filters to try again.</p>}
                {!isLoading && !error && analytics && <>
                    <section className="analysis-kpi-grid">
                        <article><span>Total transactions</span><strong>{analytics?.totalTransactions}</strong><small>{analytics?.processedTransactions} processed</small></article>
                        <article><span>Qualification rate</span><strong>{analytics?.qualificationRate}%</strong><small>{analytics?.qualifiedTransactions} qualified transactions</small></article>
                        <article><span>Estimated fees</span><strong>{Number(analytics?.totalFees || 0).toFixed(2)} EUR</strong><small>Combined filtered amount</small></article>
                        <article><span>Average transaction</span><strong>{Number(analytics?.averageTransactionAmount || 0).toFixed(2)} EUR</strong><small>Total amount: {Number(analytics?.totalAmount || 0).toFixed(2)} EUR</small></article>
                    </section>
                    <section className="analysis-chart-grid">
                        <article className="analysis-card"><div className="analysis-card-heading"><h3>Qualification results</h3><span>{analytics?.totalTransactions} total</span></div><BarList items={analytics?.qualificationResults || []} valueLabel="Transactions" /></article>
                        <article className="analysis-card"><div className="analysis-card-heading"><h3>Transactions by scheme</h3><span>Volume</span></div><BarList items={analytics?.feesByScheme || []} valueLabel="Transactions" /></article>
                        <article className="analysis-card"><div className="analysis-card-heading"><h3>Transactions by country</h3><span>Volume</span></div><BarList items={analytics?.transactionsByCountry || []} valueLabel="Top six countries" /></article>
                        <article className="analysis-card"><div className="analysis-card-heading"><h3>Top merchants by fees</h3><span>Fees (EUR)</span></div><BarList items={analytics?.topMerchantsByFees || []} valueLabel="Estimated fees" useFees /></article>
                    </section>
                </>}
            </section>
        </main>
    );
}
