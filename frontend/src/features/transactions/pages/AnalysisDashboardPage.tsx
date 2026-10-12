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
import { Button, Card, DatePicker, Input, Modal, Progress, Select, Spin, Tooltip } from "antd";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { UploadComparisonPanel } from "../components/UploadComparisonPanel";
import {
    ANALYTICS_CURRENCY,
    getAvailableCurrencies,
    getAnalytics,
    type AnalyticsFilters,
    type AnalyticsMetric,
    type AnalyticsResponse
} from "../api/analyticsApi";
import { getAllUploadTransactions, getUploads } from "../../uploads/api/uploadsApi";
import type { UploadSummary } from "../../uploads/types/upload";
import type { Transaction } from "../../../shared/types/transaction";

type Filters = AnalyticsFilters;

interface DonutSegment {
    label: string;
    value: number;
    color: string;
}

type DrilldownDimension = "qualification" | "merchant" | "country" | "scheme";
interface DrilldownConfig { title: string; dimension: DrilldownDimension; category?: string; }
interface DrilldownTransaction extends Transaction { uploadId: string; uploadFileName: string; }

const emptyFilters: Filters = {
    from: "",
    to: "",
    scheme: "",
    country: "",
    merchant: "",
    qualification: "",
    targetCurrency: ANALYTICS_CURRENCY
};

const filterKeys = Object.keys(emptyFilters) as Array<keyof Filters>;
const barColors = [
    "#5899C4",
    "#FF5641",
    "#CF820E",
    "#30A661",
    "#8684BF",
    "#7B9922",
    "#998F63",
    "#7C94A6",
    "#3E9C8F"
];
const label = (value: string) => value.replaceAll("_", " ");
const normalizedQualification = (value: string | null | undefined) => {
    const normalized = value?.toUpperCase();
    return !normalized || normalized === "NOT_EVALUATED" || normalized === "UNKNOWN" ? "PENDING" : normalized;
};
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
    denominator,
    onSelectItem
}: {
    items: AnalyticsMetric[];
    useFees?: boolean;
    currency?: string;
    denominator?: number;
    onSelectItem?: (item: AnalyticsMetric) => void;
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
                    <div
                        className={`analysis-bar-row${onSelectItem ? " analysis-bar-row-clickable" : ""}`}
                        key={item.name}
                        onClick={(event) => { event.stopPropagation(); onSelectItem?.(item); }}
                        onKeyDown={(event) => {
                            if (onSelectItem && (event.key === "Enter" || event.key === " ")) {
                                event.preventDefault();
                                event.stopPropagation();
                                onSelectItem(item);
                            }
                        }}
                        role={onSelectItem ? "button" : undefined}
                        tabIndex={onSelectItem ? 0 : undefined}
                        aria-label={onSelectItem ? `View ${label(item.name)} transactions` : undefined}
                    >
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

function AnalyticsDrilldown({
    config,
    appliedFilters,
    onClose,
    onOpenTransaction
}: {
    config: DrilldownConfig;
    appliedFilters: Filters;
    onClose: () => void;
    onOpenTransaction: (upload: UploadSummary, transaction: Transaction) => void;
}) {
    const [uploads, setUploads] = useState<UploadSummary[]>([]);
    const [transactions, setTransactions] = useState<DrilldownTransaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploadFilter, setUploadFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState(config.category ?? "");
    const [qualificationFilter, setQualificationFilter] = useState(appliedFilters.qualification);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        void (async () => {
            setIsLoading(true);
            setError(null);
            try {
                const allUploads: UploadSummary[] = [];
                let page = 0;
                let totalPages = 1;
                while (page < totalPages) {
                    const result = await getUploads({ page, size: 100, search: "", sort: "uploadedAt,desc" }, controller.signal);
                    allUploads.push(...result.items);
                    totalPages = result.totalPages;
                    page += 1;
                }
                if (controller.signal.aborted) return;
                setUploads(allUploads);

                const allTransactions: DrilldownTransaction[] = [];
                for (let index = 0; index < allUploads.length; index += 3) {
                    const batch = allUploads.slice(index, index + 3);
                    const results = await Promise.all(batch.map(async (upload) => ({
                        upload,
                        transactions: await getAllUploadTransactions(upload.id, controller.signal)
                    })));
                    if (controller.signal.aborted) return;
                    results.forEach(({ upload, transactions: uploadTransactions }) => {
                        allTransactions.push(...uploadTransactions.map((transaction) => ({
                            ...transaction,
                            uploadId: upload.id,
                            uploadFileName: upload.fileName
                        })));
                    });
                }
                setTransactions(allTransactions);
            } catch (requestError: unknown) {
                if (!controller.signal.aborted) {
                    setError(requestError instanceof Error ? requestError.message : "Could not load chart transactions.");
                }
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        })();
        return () => controller.abort();
    }, []);

    const categories = useMemo(() => {
        const getValue = (transaction: DrilldownTransaction) => {
            if (config.dimension === "merchant") return transaction.merchantName;
            if (config.dimension === "country") return transaction.merchantCountry ?? "Unknown country";
            if (config.dimension === "scheme") return transaction.scheme;
            return normalizedQualification(transaction.qualificationStatus);
        };
        return Array.from(new Set(transactions.map(getValue).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }, [config.dimension, transactions]);

    const filteredTransactions = useMemo(() => transactions.filter((transaction) => {
        const qualification = normalizedQualification(transaction.qualificationStatus);
        const category = config.dimension === "merchant" ? transaction.merchantName
            : config.dimension === "country" ? transaction.merchantCountry ?? "Unknown country"
            : config.dimension === "scheme" ? transaction.scheme
            : qualification;
        if (uploadFilter && transaction.uploadId !== uploadFilter) return false;
        if (qualificationFilter && qualification !== qualificationFilter) return false;
        if (categoryFilter && category !== categoryFilter) return false;
        if (appliedFilters.scheme && transaction.scheme.toLowerCase() !== appliedFilters.scheme.toLowerCase()) return false;
        if (appliedFilters.country && (transaction.merchantCountry ?? "").toLowerCase() !== appliedFilters.country.toLowerCase()) return false;
        if (appliedFilters.merchant && transaction.merchantName.toLowerCase() !== appliedFilters.merchant.toLowerCase()) return false;
        if (appliedFilters.from && transaction.authorizedAt && transaction.authorizedAt.slice(0, 10) < appliedFilters.from) return false;
        if (appliedFilters.to && transaction.authorizedAt && transaction.authorizedAt.slice(0, 10) > appliedFilters.to) return false;
        if (search.trim()) {
            const haystack = [transaction.externalId, transaction.merchantName, transaction.scheme, transaction.merchantCountry, transaction.uploadFileName].join(" ").toLowerCase();
            if (!haystack.includes(search.trim().toLowerCase())) return false;
        }
        return true;
    }), [transactions, uploadFilter, qualificationFilter, categoryFilter, config.dimension, appliedFilters, search]);

    const uploadCounts = useMemo(() => uploads.map((upload) => ({
        upload,
        count: filteredTransactions.filter((transaction) => transaction.uploadId === upload.id).length
    })).filter(({ count }) => count > 0), [uploads, filteredTransactions]);

    const qualificationOptions = ["QUALIFIED", "PARTIALLY_QUALIFIED", "NOT_QUALIFIED", "PENDING"];
    return (
        <Modal
            className="analytics-drilldown-modal"
            title={<div><span className="analytics-modal-eyebrow">CHART DETAILS</span><h2>{config.title}</h2></div>}
            open
            onCancel={onClose}
            footer={null}
            width={1050}
            centered
            destroyOnClose
        >
            <div className="analytics-drilldown-controls">
                <Select
                    aria-label="Filter by upload"
                    value={uploadFilter || "all"}
                    onChange={(value) => setUploadFilter(value === "all" ? "" : value)}
                    options={[{ value: "all", label: "All uploads" }, ...uploads.map((upload) => ({ value: upload.id, label: upload.fileName }))]}
                />
                <Select
                    aria-label="Filter by qualification category"
                    value={qualificationFilter || "all"}
                    onChange={(value) => setQualificationFilter(value === "all" ? "" : value)}
                    options={[{ value: "all", label: "All qualification results" }, ...qualificationOptions.map((value) => ({ value, label: label(value) }))]}
                />
                <Select
                    aria-label={`Filter by ${config.dimension} chart category`}
                    value={categoryFilter || "all"}
                    onChange={(value) => setCategoryFilter(value === "all" ? "" : value)}
                    options={[{ value: "all", label: `All ${config.dimension} categories` }, ...categories.map((value) => ({ value, label: label(value) }))]}
                />
                <Input.Search placeholder="Find a transaction" value={search} onChange={(event) => setSearch(event.target.value)} allowClear />
            </div>

            <section className="analytics-upload-split" aria-label="Transactions by upload">
                <div className="analytics-detail-section-heading"><h3>Split by upload</h3><span>{formatInteger(filteredTransactions.length)} transactions</span></div>
                {isLoading ? <div className="analytics-detail-loading"><Spin /><span>Loading transactions across uploads…</span></div>
                    : uploadCounts.length ? <div className="analytics-upload-pills">
                        {uploadCounts.map(({ upload, count }) => (
                            <button type="button" className={uploadFilter === upload.id ? "selected" : ""} key={upload.id} onClick={() => setUploadFilter((current) => current === upload.id ? "" : upload.id)}>
                                <span>{upload.fileName}</span><strong>{formatInteger(count)}</strong>
                            </button>
                        ))}
                    </div> : <p className="analysis-empty">No uploads match these filters.</p>}
            </section>

            <section className="analytics-transactions-section" aria-label="Matching transactions">
                <div className="analytics-detail-section-heading"><h3>Transactions</h3><span>{formatInteger(filteredTransactions.length)} results</span></div>
                {error ? <p className="analysis-empty" role="alert">{error}</p>
                    : isLoading ? null
                    : filteredTransactions.length ? <div className="analytics-transaction-list">
                        {filteredTransactions.slice(0, 200).map((transaction) => (
                            <button type="button" className="analytics-transaction-row" key={`${transaction.uploadId}-${transaction.id}`} onClick={() => {
                                const upload = uploads.find((item) => item.id === transaction.uploadId);
                                if (upload) onOpenTransaction(upload, transaction);
                            }}>
                                <span className="analytics-transaction-primary"><strong>{transaction.externalId}</strong><small>{transaction.merchantName} · {transaction.scheme}</small></span>
                                <span className="analytics-transaction-upload" title={transaction.uploadFileName}>{transaction.uploadFileName}</span>
                                <span className={`analytics-qualification-badge ${normalizedQualification(transaction.qualificationStatus).toLowerCase()}`}>{label(normalizedQualification(transaction.qualificationStatus))}</span>
                                <strong>{formatCurrency(transaction.amount, transaction.currencyCode)}</strong>
                            </button>
                        ))}
                        {filteredTransactions.length > 200 && <p className="analysis-empty">Showing the first 200 matches. Refine the filters to narrow the list.</p>}
                    </div> : <p className="analysis-empty">No transactions match these filters.</p>}
            </section>
        </Modal>
    );
}

export function AnalysisDashboardPage({
    onOpenTransaction
}: {
    onOpenTransaction: (upload: UploadSummary, transaction: Transaction) => void;
}) {
    const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
    const [availableCurrencies, setAvailableCurrencies] = useState<string[]>([ANALYTICS_CURRENCY]);
    const [filters, setFilters] = useState<Filters>(emptyFilters);
    const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const analyticsRequestRef = useRef<AbortController | null>(null);
    const [requestWasCancelled, setRequestWasCancelled] = useState(false);
    const [isApplyingFilters, setIsApplyingFilters] = useState(false);
    const [areFiltersOpen, setAreFiltersOpen] = useState(false);
    const [drilldown, setDrilldown] = useState<DrilldownConfig | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        getAvailableCurrencies(controller.signal)
            .then((currencies) => {
                setAvailableCurrencies(Array.from(new Set([ANALYTICS_CURRENCY, ...currencies])).sort());
            })
            .catch(() => {
                if (!controller.signal.aborted) setAvailableCurrencies([ANALYTICS_CURRENCY]);
            });

        return () => controller.abort();
    }, []);

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
            { label: "Qualified", value: qualified, color: "#5899C4" },
            { label: "Not qualified", value: notQualified + partiallyQualified, color: "#FF5641" },
            { label: "Pending", value: pending, color: "#7C94A6" }
        ];
    }, [analytics]);

    const qualificationRateSegments = useMemo<DonutSegment[]>(() => {
        if (!analytics) return [];
        return [
            { label: "Qualified", value: analytics.qualifiedTransactions, color: "#5899C4" },
            { label: "Not qualified", value: Math.max(analytics.totalTransactions - analytics.qualifiedTransactions, 0), color: "#FF5641" }
        ];
    }, [analytics]);

    const openDrilldown = (title: string, dimension: DrilldownDimension, category?: string) => {
        setDrilldown({ title, dimension, category });
    };

    const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
    const hasPendingFilterChanges = requestWasCancelled || !filtersMatch(filters, appliedFilters);
    const hasFilterValues = filterKeys.some(
        (key) => key !== "targetCurrency" && (Boolean(filters[key]) || Boolean(appliedFilters[key]))
    )
        || filters.targetCurrency !== ANALYTICS_CURRENCY
        || appliedFilters.targetCurrency !== ANALYTICS_CURRENCY;
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
                    <h2>Analytics</h2>
                    <div className="analysis-heading-actions">
                        <Tooltip title={areFiltersOpen ? "Hide filters" : "Show filters"}>
                            <Button
                                shape="circle"
                                icon={<FilterOutlined />}
                                onClick={() => setAreFiltersOpen((open) => !open)}
                                aria-label={areFiltersOpen ? "Hide filters" : "Show filters"}
                                aria-expanded={areFiltersOpen}
                                aria-controls="analytics-filter-panel"
                            />
                        </Tooltip>
                        <Tooltip
                            title="Export CSV"
                            color="#FF5640"
                            styles={{ container: { color: "#ffffff" } }}
                        >
                            <Button
                                type="primary"
                                shape="circle"
                                icon={<DownloadOutlined />}
                                onClick={exportCsv}
                                disabled={!analytics?.totalTransactions}
                                aria-label="Export CSV"
                            />
                        </Tooltip>
                    </div>
                </div>
                {areFiltersOpen && <section id="analytics-filter-panel" className="analysis-filter-panel" aria-label="Dashboard filters">
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
                            <span>Currency</span>
                            <Select
                                className="analysis-filter-control"
                                value={filters.targetCurrency}
                                options={availableCurrencies.map((value) => ({ value, label: value }))}
                                onChange={(value) => setFilter("targetCurrency", value)}
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
                </section>}
                {isLoading && <div className="analysis-loading" role="status" aria-live="polite"><Spin size="large" /><span>Loading analytics...</span></div>}
                {error && <ErrorMessage title="Unable to load analytics" message={error} />}
                {!isLoading && !error && !analytics && <p className="analysis-empty">Analytics request was cancelled. Apply filters to try again.</p>}
                {!isLoading && !error && analytics && <>
                    <section className="analysis-kpi-grid analysis-animated">
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
                    <section className="analysis-chart-grid analysis-animated">
                        <Card className="analysis-card analysis-chart-launch" onClick={() => openDrilldown("Qualification results", "qualification")}>
                            <div className="analysis-card-heading"><h3>Qualification results</h3><button type="button" className="analysis-detail-link" onClick={(event) => { event.stopPropagation(); openDrilldown("Qualification results", "qualification"); }}>Explore details ↗</button></div>
                            <BarList items={analytics.qualificationResults} denominator={analytics.totalTransactions} onSelectItem={(item) => openDrilldown("Qualification results", "qualification", item.name)} />
                        </Card>
                        <Card className="analysis-card analysis-chart-launch" onClick={() => openDrilldown("Top merchants by fees", "merchant")}>
                            <div className="analysis-card-heading"><h3>Top merchants by fees</h3><button type="button" className="analysis-detail-link" onClick={(event) => { event.stopPropagation(); openDrilldown("Top merchants by fees", "merchant"); }}>Explore details ↗</button></div>
                            <BarList items={analytics.topMerchantsByFees} useFees currency={analytics.currency} denominator={Number(analytics.totalFees)} onSelectItem={(item) => openDrilldown("Top merchants by fees", "merchant", item.name)} />
                        </Card>
                        <Card className="analysis-card analysis-chart-launch" onClick={() => openDrilldown("Transactions by country", "country")}>
                            <div className="analysis-card-heading"><h3>Transactions by country</h3><button type="button" className="analysis-detail-link" onClick={(event) => { event.stopPropagation(); openDrilldown("Transactions by country", "country"); }}>Explore details ↗</button></div>
                            <BarList items={analytics.transactionsByCountry} denominator={analytics.totalTransactions} onSelectItem={(item) => openDrilldown("Transactions by country", "country", item.name)} />
                        </Card>
                        <Card className="analysis-card analysis-chart-launch" onClick={() => openDrilldown("Transactions by scheme", "scheme")}>
                            <div className="analysis-card-heading"><h3>Transactions by scheme</h3><button type="button" className="analysis-detail-link" onClick={(event) => { event.stopPropagation(); openDrilldown("Transactions by scheme", "scheme"); }}>Explore details ↗</button></div>
                            <BarList items={analytics.feesByScheme} denominator={analytics.totalTransactions} onSelectItem={(item) => openDrilldown("Transactions by scheme", "scheme", item.name)} />
                        </Card>
                    </section>
                </>}
            </section>
            {drilldown && <AnalyticsDrilldown
                key={`${drilldown.title}-${drilldown.category ?? "all"}`}
                config={drilldown}
                appliedFilters={appliedFilters}
                onClose={() => setDrilldown(null)}
                onOpenTransaction={onOpenTransaction}
            />}
        </main>
    );
}
