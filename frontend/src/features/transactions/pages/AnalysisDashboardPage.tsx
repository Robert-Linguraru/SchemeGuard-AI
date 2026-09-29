import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import {
    CloseOutlined,
    DownloadOutlined,
    EuroOutlined,
    FilterOutlined,
    PercentageOutlined,
    ReloadOutlined
} from "@ant-design/icons";
import { Button, Card, DatePicker, Progress, Select, Spin, Tooltip } from "antd";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import {
    getAnalytics,
    type AnalyticsFilters,
    type AnalyticsMetric,
    type AnalyticsResponse
} from "../api/analyticsApi";

type Filters = AnalyticsFilters;

interface DonutSegment {
    label: string;
    value: number;
    color: string;
}

const emptyFilters: Filters = {
    from: "",
    to: "",
    scheme: "",
    country: "",
    merchant: "",
    qualification: ""
};

const filterKeys = Object.keys(emptyFilters) as Array<keyof Filters>;
const barColors = [
    "#38a6ff",
    "#ff6b62",
    "#36d6a2",
    "#b18cff",
    "#f6c85f",
    "#55d6d2",
    "#f28fca",
    "#8dd35f",
    "#ff9f43",
    "#7b8cff"
];
const label = (value: string) => value.replaceAll("_", " ");
const formatInteger = (value: number | string | null | undefined) =>
    new Intl.NumberFormat("en-US").format(Number(value || 0));
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatCurrency = (value: number | string | null | undefined, currency = "EUR") =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value || 0));
const formatCompactCurrency = (value: number | string | null | undefined, currency = "EUR") =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1
    }).format(Number(value || 0));

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

function metricCount(items: AnalyticsMetric[], name: string): number {
    return Number(items.find((item) => item.name.toUpperCase() === name)?.transactions || 0);
}

function SegmentedDonut({
    segments,
    total
}: {
    segments: DonutSegment[];
    total: number;
}) {
    const denominator = Math.max(total, 0);
    let offset = 0;
    const stops = segments.flatMap((segment) => {
        const percentage = denominator === 0 ? 0 : (segment.value / denominator) * 100;
        const start = offset;
        offset += Math.max(percentage, 0);
        return [`${segment.color} ${start}% ${offset}%`];
    });

    if (offset < 100) {
        stops.push(`rgba(255, 255, 255, .12) ${offset}% 100%`);
    }

    return (
        <div
            className="analysis-donut"
            style={{
                background: `conic-gradient(from -90deg, ${stops.join(", ") || "rgba(255, 255, 255, .12) 0 100%"})`
            }}
            role="img"
            aria-label="Analytics status distribution"
        />
    );
}

function BarList({
    items,
    useFees = false,
    currency,
    denominator
}: {
    items: AnalyticsMetric[];
    useFees?: boolean;
    currency?: string;
    denominator?: number;
}) {
    const values = items.map((item) => (useFees ? Number(item.fees || 0) : item.transactions));
    const max = Math.max(...values, 1);
    const percentageTotal = denominator ?? values.reduce((sum, value) => sum + value, 0);

    if (!items.length) return <p className="analysis-empty">No data for the selected filters.</p>;

    return (
        <div className="analysis-bars">
            <div className="analysis-table-heading" aria-hidden="true">
                <span />
                <span />
                <span>Total</span>
                <span>%</span>
            </div>
            {items.slice(0, 6).map((item, index) => {
                const value = values[index];
                const percentage = percentageTotal ? (value / percentageTotal) * 100 : 0;
                const color = barColors[index % barColors.length];

                return (
                    <div className="analysis-bar-row" key={item.name}>
                        <span title={label(item.name)}>{label(item.name)}</span>
                        <Progress
                            percent={(value / max) * 100}
                            showInfo={false}
                            strokeColor={color}
                            trailColor="rgba(255, 255, 255, .12)"
                        />
                        <strong>{useFees ? formatCompactCurrency(value, currency) : formatInteger(value)}</strong>
                        <strong>{formatPercent(percentage)}</strong>
                    </div>
                );
            })}
        </div>
    );
}

export function AnalysisDashboardPage() {
    const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
    const [filters, setFilters] = useState<Filters>(emptyFilters);
    const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const analyticsRequestRef = useRef<AbortController | null>(null);
    const [requestWasCancelled, setRequestWasCancelled] = useState(false);
    const [isApplyingFilters, setIsApplyingFilters] = useState(false);

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
                    setIsApplyingFilters(false);
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

    const qualificationSegments = useMemo<DonutSegment[]>(() => {
        if (!analytics) return [];
        const qualified = metricCount(analytics.qualificationResults, "QUALIFIED") || analytics.qualifiedTransactions;
        const partiallyQualified = metricCount(analytics.qualificationResults, "PARTIALLY_QUALIFIED") || analytics.partiallyQualifiedTransactions;
        const notQualified = metricCount(analytics.qualificationResults, "NOT_QUALIFIED") || analytics.notQualifiedTransactions;
        const pendingFromBackend = metricCount(analytics.qualificationResults, "PENDING");
        const pending = pendingFromBackend || Math.max(analytics.totalTransactions - qualified - partiallyQualified - notQualified, 0);
        return [
            { label: "Qualified", value: qualified, color: "#38a6ff" },
            { label: "Not qualified", value: notQualified + partiallyQualified, color: "#ff6b62" },
            { label: "Pending", value: pending, color: "#36d6a2" }
        ];
    }, [analytics]);

    const qualificationRateSegments = useMemo<DonutSegment[]>(() => {
        if (!analytics) return [];
        return [
            { label: "Qualified", value: analytics.qualifiedTransactions, color: "#38a6ff" },
            { label: "Not qualified", value: Math.max(analytics.totalTransactions - analytics.qualifiedTransactions, 0), color: "#ff6b62" }
        ];
    }, [analytics]);

    const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
    const hasPendingFilterChanges = requestWasCancelled || !filtersMatch(filters, appliedFilters);
    const hasFilterValues = filterKeys.some((key) => Boolean(filters[key]) || Boolean(appliedFilters[key]));
    const applyFilters = () => {
        if (!hasPendingFilterChanges) return;
        setRequestWasCancelled(false);
        setIsApplyingFilters(true);
        setAppliedFilters({ ...filters });
    };
    const resetFilters = () => {
        setFilters({ ...emptyFilters });
        setRequestWasCancelled(false);
        setIsApplyingFilters(true);
        setAppliedFilters({ ...emptyFilters });
    };
    const cancelAnalyticsRequest = () => {
        const controller = analyticsRequestRef.current;
        if (!controller) return;

        controller.abort();
        analyticsRequestRef.current = null;
        setIsLoading(false);
        setIsApplyingFilters(false);
        setRequestWasCancelled(true);
    };

    const exportCsv = () => {
        if (!analytics) return;
        const appliedFilterRows = filterKeys.map((key) => [key, appliedFilters[key] || "No filter applied"]);
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
            ["Analytics currency", analytics.currency],
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
            <section className="content">
                <div className="page-heading analysis-heading">
                    <div><p className="eyebrow">ANALYSIS DASHBOARD</p><h2>Descriptive statistics</h2><p>Explore qualification results, fees and transaction distribution.</p></div>
                    <Tooltip title="Export CSV">
                        <Button
                            type="primary"
                            shape="circle"
                            className="analysis-export-button"
                            icon={<DownloadOutlined />}
                            onClick={exportCsv}
                            disabled={!analytics?.totalTransactions}
                            aria-label="Export CSV"
                        />
                    </Tooltip>
                </div>
                <section className="analysis-filter-panel" aria-label="Dashboard filters">
                    <div className="analysis-filter-grid">
                        <div className="analysis-filter-field">
                            <span>From</span>
                            <DatePicker
                                className="analysis-filter-control"
                                value={filters.from ? dayjs(filters.from) : null}
                                format="YYYY-MM-DD"
                                placeholder="Start date"
                                onChange={(date) => setFilter("from", date ? date.format("YYYY-MM-DD") : "")}
                            />
                        </div>
                        <div className="analysis-filter-field">
                            <span>To</span>
                            <DatePicker
                                className="analysis-filter-control"
                                value={filters.to ? dayjs(filters.to) : null}
                                format="YYYY-MM-DD"
                                placeholder="End date"
                                onChange={(date) => setFilter("to", date ? date.format("YYYY-MM-DD") : "")}
                            />
                        </div>
                        <div className="analysis-filter-field">
                            <span>Scheme</span>
                            <Select
                                className="analysis-filter-control"
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
                                className="analysis-filter-control"
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
                                className="analysis-filter-control"
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
                                className="analysis-filter-control"
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
                        <div className="analysis-filter-actions">
                            <Button type="primary" icon={<FilterOutlined />} onClick={applyFilters} disabled={!hasPendingFilterChanges || isLoading}>
                                Apply filters
                            </Button>
                            {isLoading && isApplyingFilters && <Tooltip title="Cancel request">
                                <Button danger shape="circle" icon={<CloseOutlined />} onClick={cancelAnalyticsRequest} disabled={!isLoading} aria-label="Cancel analytics request" />
                            </Tooltip>}
                            <Button icon={<ReloadOutlined />} onClick={resetFilters} disabled={!hasFilterValues || isLoading}>
                                Reset filters
                            </Button>
                        </div>
                    </div>
                </section>
                {isLoading && <div className="analysis-loading" role="status" aria-live="polite"><Spin size="large" /><span>Loading analytics...</span></div>}
                {error && <ErrorMessage title="Unable to load analytics" message={error} />}
                {!isLoading && !error && !analytics && <p className="analysis-empty">Analytics request was cancelled. Apply filters to try again.</p>}
                {!isLoading && !error && analytics && <>
                    <section className="analysis-kpi-grid">
                        <Card className="analysis-kpi-card">
                            <div className="analysis-kpi-copy"><span>Total transactions</span><strong>{formatInteger(analytics.totalTransactions)}</strong></div>
                            <div className="analysis-donut-wrap">
                                <SegmentedDonut segments={qualificationSegments} total={analytics.totalTransactions} />
                            </div>
                        </Card>
                        <Card className="analysis-kpi-card analysis-simple-kpi">
                            <div className="analysis-kpi-copy"><span>Total fees</span><strong>{formatCompactCurrency(analytics.totalFees, analytics.currency)}</strong></div>
                            <span className="analysis-kpi-icon analysis-kpi-icon-green"><EuroOutlined /></span>
                        </Card>
                        <Card className="analysis-kpi-card">
                            <div className="analysis-kpi-copy"><span>Qualification rate</span><strong>{Number(analytics.qualificationRate || 0).toFixed(1)}%</strong><small>{formatInteger(analytics.qualifiedTransactions)} qualified transactions</small></div>
                            <div className="analysis-donut-wrap">
                                <SegmentedDonut segments={qualificationRateSegments} total={analytics.totalTransactions} />
                            </div>
                        </Card>
                        <Card className="analysis-kpi-card analysis-simple-kpi">
                            <div className="analysis-kpi-copy"><span>Average transaction</span><strong>{formatCurrency(analytics.averageTransactionAmount, analytics.currency)}</strong><small>Total transaction amount: {formatCurrency(analytics.totalAmount, analytics.currency)}</small></div>
                            <span className="analysis-kpi-icon analysis-kpi-icon-purple"><PercentageOutlined /></span>
                        </Card>
                    </section>
                    <section className="analysis-chart-grid">
                        <Card className="analysis-card"><div className="analysis-card-heading"><h3>Qualification results</h3></div><BarList items={analytics.qualificationResults} denominator={analytics.totalTransactions} /></Card>
                        <Card className="analysis-card"><div className="analysis-card-heading"><h3>Top merchants by fees</h3></div><BarList items={analytics.topMerchantsByFees} useFees currency={analytics.currency} denominator={Number(analytics.totalFees)} /></Card>
                        <Card className="analysis-card"><div className="analysis-card-heading"><h3>Transactions by country</h3></div><BarList items={analytics.transactionsByCountry} denominator={analytics.totalTransactions} /></Card>
                        <Card className="analysis-card"><div className="analysis-card-heading"><h3>Transactions by scheme</h3></div><BarList items={analytics.feesByScheme} denominator={analytics.totalTransactions} /></Card>
                    </section>
                </>}
            </section>
        </main>
    );
}
