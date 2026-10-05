import { useCallback, useEffect, useRef, useState } from "react";
import {
    confirmUploadOutlier,
    detectUploadOutliers,
    evaluateUpload,
    getUploadOutlierIds,
    getUploadAnomalyJob,
    getUploadStatistics,
    getUploadTransactions
} from "../../uploads/api/uploadsApi";
import type { UploadStatistics } from "../../uploads/types/upload";
import { isAbortError } from "../../../shared/api/httpClient";
import { LoadingState } from "../../../shared/components/LoadingState";
import { TransactionStats } from "../components/TransactionStats";
import { RecommendationAssistant } from "../components/RecommendationAssistant";
import { getTransactionExplanation, type TransactionExplanation } from "../api/transactionExplanationApi";
import { TransactionDetails } from "../components/TransactionDetails";
import { EntityList } from "../../../shared/components/EntityList/EntityList";
import type { Transaction } from "../../../shared/types/transaction";
import type {
    EntityListColumn,
    EntityListQuery,
    EntityListResponse
} from "../../../shared/types/list";
import { App as AntdApp, Button, Tooltip } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";

interface DashboardPageProps {
    onOpenAssistant: () => void;
    onCloseAssistant: () => void;
    isAssistantOpen: boolean;
    onOpenRule: (ruleId: string) => void;
    selectedUploadId?: string | null;
    selectedUploadFileName?: string | null;
    selectedUploadImportStatus?: string | null;
    selectedUploadWasEvaluated?: boolean;
    onUploadEvaluated: (wasEvaluated: boolean) => void;
}

export function DashboardPage({
    onOpenAssistant,
    onCloseAssistant,
    isAssistantOpen,
    onOpenRule,
    selectedUploadId,
    selectedUploadFileName,
    selectedUploadImportStatus,
    selectedUploadWasEvaluated = false,
    onUploadEvaluated
}: DashboardPageProps) {
    const { notification } = AntdApp.useApp();
    const [uploadStatistics, setUploadStatistics] = useState<UploadStatistics | null>(null);
    const [isLoadingStatistics, setIsLoadingStatistics] = useState(false);
    const [statisticsError, setStatisticsError] = useState<string | null>(null);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [evaluationError, setEvaluationError] = useState<string | null>(null);
    const [transactionReloadKey, setTransactionReloadKey] = useState(0);
    const [outlierIds, setOutlierIds] = useState<Set<string>>(new Set());
    const [confirmedOutlierIds, setConfirmedOutlierIds] = useState<Set<string>>(new Set());
    const [isDetectingOutliers, setIsDetectingOutliers] = useState(false);
    const [anomalyError, setAnomalyError] = useState<string | null>(null);
    const [showTransactionFilters, setShowTransactionFilters] = useState(false);
    const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
    const [transactionDetails, setTransactionDetails] = useState<Record<string, TransactionExplanation>>({});
    const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
    const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
    const detailRequest = useRef<AbortController | null>(null);
    const detailCache = useRef(new Map<string, TransactionExplanation>());

    const canEvaluate = selectedUploadImportStatus === "COMPLETED"
        && !selectedUploadWasEvaluated;
    const canDetectOutliers = selectedUploadImportStatus === "COMPLETED"
        && selectedUploadWasEvaluated;

    useEffect(() => {
        const controller = new AbortController();
        setUploadStatistics(null);
        setStatisticsError(null);
        setIsLoadingStatistics(Boolean(selectedUploadId));

        if (selectedUploadId) {
            void getUploadStatistics(selectedUploadId, controller.signal)
                .then((statistics) => {
                    if (!controller.signal.aborted) {
                        setUploadStatistics(statistics);
                    }
                })
                .catch((error: unknown) => {
                    if (!controller.signal.aborted) {
                        setStatisticsError(error instanceof Error
                            ? error.message
                            : "Could not load upload statistics.");
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) {
                        setIsLoadingStatistics(false);
                    }
                });
        }

        return () => controller.abort();
    }, [selectedUploadId, transactionReloadKey]);

    useEffect(() => {
        let cancelled = false;
        setOutlierIds(new Set());
        setConfirmedOutlierIds(new Set());
        setAnomalyError(null);
        if (!selectedUploadId) {
            return () => { cancelled = true; };
        }
        void getUploadOutlierIds(selectedUploadId)
            .then((ids) => {
                if (!cancelled) {
                    setOutlierIds(new Set(ids));
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setAnomalyError("Could not load detected outliers.");
                }
            });
        return () => { cancelled = true; };
    }, [selectedUploadId]);

    useEffect(() => {
        if (!selectedUploadId) return;
        let cancelled = false;
        void getUploadAnomalyJob(selectedUploadId).then((job) => {
            if (cancelled) return;
            setIsDetectingOutliers(job.status === "PENDING" || job.status === "RUNNING");
            if (job.status === "FAILED") setAnomalyError(job.errorMessage ?? "Could not detect outliers.");
        }).catch(() => {
            // No job exists until anomaly detection is requested.
        });
        return () => { cancelled = true; };
    }, [selectedUploadId]);

    useEffect(() => {
        if (!selectedUploadId || !isDetectingOutliers) return;
        let cancelled = false;
        const timer = window.setInterval(() => {
            void getUploadAnomalyJob(selectedUploadId).then(async (job) => {
                if (cancelled) return;
                if (job.status === "COMPLETED") {
                    window.clearInterval(timer);
                    const ids = await getUploadOutlierIds(selectedUploadId);
                    if (cancelled) return;
                    setOutlierIds(new Set(ids));
                    setConfirmedOutlierIds(new Set());
                    setIsDetectingOutliers(false);
                    setAnomalyMessage(ids.length === 0
                        ? "Outlier detection completed. No outliers were found in this CSV."
                        : `Outlier detection completed. ${ids.length} outlier${ids.length === 1 ? "" : "s"} found.`);
                } else if (job.status === "FAILED") {
                    window.clearInterval(timer);
                    setIsDetectingOutliers(false);
                    setAnomalyError(job.errorMessage ?? "Could not detect outliers.");
                }
            }).catch(() => {
                // The next poll retries transient status endpoint errors.
            });
        }, 1500);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [selectedUploadId, isDetectingOutliers]);

    const runEvaluation = async () => {
        if (!selectedUploadId || !canEvaluate || isEvaluating) {
            return;
        }

        setIsEvaluating(true);
        setEvaluationError(null);
        try {
            const result = await evaluateUpload(selectedUploadId);
            notification.success({
                placement: "topRight",
                message: "Evaluation complete",
                description: result.message
            });
            onUploadEvaluated(result.wasEvaluated);
            setTransactionReloadKey((key) => key + 1);
        } catch (requestError: unknown) {
            setEvaluationError(
                requestError instanceof Error
                    ? requestError.message
                    : "Could not evaluate this upload"
            );
        } finally {
            setIsEvaluating(false);
        }
    };

    useEffect(() => {
        detailRequest.current?.abort();
        detailRequest.current = null;
        detailCache.current.clear();
        setExpandedTransactionId(null);
        setTransactionDetails({});
        setDetailErrors({});
        setLoadingDetailId(null);
    }, [selectedUploadId]);

    useEffect(() => () => {
        detailRequest.current?.abort();
    }, []);

    const loadTransactionDetails = useCallback(async (transaction: Transaction) => {
        if (!selectedUploadId) {
            return;
        }

        if (detailCache.current.has(transaction.id)) {
            setExpandedTransactionId(transaction.id);
            return;
        }

        const qualificationStatus = transaction.qualificationStatus?.toUpperCase();
        const isUnevaluated = transaction.status.toUpperCase() === "NEW"
            || qualificationStatus === "NOT_EVALUATED"
            || qualificationStatus === "PENDING"
            || qualificationStatus === "UNKNOWN";

        if (isUnevaluated) {
            setExpandedTransactionId(transaction.id);
            setLoadingDetailId(null);
            return;
        }

        detailRequest.current?.abort();
        const controller = new AbortController();
        detailRequest.current = controller;
        setExpandedTransactionId(transaction.id);
        setLoadingDetailId(transaction.id);
        setDetailErrors((current) => {
            const next = { ...current };
            delete next[transaction.id];
            return next;
        });

        try {
            const details = await getTransactionExplanation(transaction.id, selectedUploadId, controller.signal);
            if (controller.signal.aborted) {
                return;
            }
            detailCache.current.set(transaction.id, details);
            setTransactionDetails((current) => ({ ...current, [transaction.id]: details }));
        } catch (requestError: unknown) {
            if (controller.signal.aborted || isAbortError(requestError)) {
                return;
            }
            setDetailErrors((current) => ({
                ...current,
                [transaction.id]: requestError instanceof Error
                    ? requestError.message
                    : "Could not load qualification details."
            }));
        } finally {
            if (!controller.signal.aborted) {
                setLoadingDetailId(null);
            }
        }
    }, [selectedUploadId]);

    const toggleTransactionDetails = (transaction: Transaction) => {
        if (expandedTransactionId === transaction.id) {
            setExpandedTransactionId(null);
            return;
        }
        void loadTransactionDetails(transaction);
    };

    const handleTransactionResponse = useCallback(
        (_response: EntityListResponse<Transaction>) => {
            detailRequest.current?.abort();
            detailCache.current.clear();
            setExpandedTransactionId(null);
            setTransactionDetails({});
            setDetailErrors({});
            setLoadingDetailId(null);
        },
        []
    );

    const runOutlierDetection = async () => {
        if (!selectedUploadId || isDetectingOutliers) {
            return;
        }

        if (!canDetectOutliers) {
            setAnomalyError("Evaluate this CSV before detecting outliers.");
            return;
        }

        setIsDetectingOutliers(true);
        setAnomalyError(null);
        try {
            const result = await detectUploadOutliers(selectedUploadId);
            setOutlierIds(new Set(result.outlierTransactionIds));
            setConfirmedOutlierIds(new Set());
            const count = result.outlierTransactionIds.length;
            notification.success({
                placement: "topRight",
                message: "Outlier detection complete",
                description: count === 0
                    ? "No outliers were found in this CSV."
                    : `${count} outlier${count === 1 ? "" : "s"} found.`
            });
        } catch (requestError: unknown) {
            setIsDetectingOutliers(false);
            setAnomalyError(
                requestError instanceof Error
                    ? requestError.message
                    : "Could not detect outliers"
            );
        } finally {
            // Keep the indicator active while the background job is pending.
        }
    };

    const confirmOutlier = async (transactionId: string) => {
        if (!selectedUploadId || confirmedOutlierIds.has(transactionId)) {
            return;
        }
        try {
            await confirmUploadOutlier(selectedUploadId, transactionId);
            setConfirmedOutlierIds((current) => new Set(current).add(transactionId));
        } catch (requestError: unknown) {
            setAnomalyError(
                requestError instanceof Error
                    ? requestError.message
                    : "Could not confirm this outlier"
            );
        }
    };

    const fetchTransactions = useCallback(
        (query: EntityListQuery, signal?: AbortSignal) => {
            if (!selectedUploadId) {
                return Promise.resolve({
                    items: [],
                    page: 0,
                    size: query.size,
                    totalElements: 0,
                    totalPages: 0
                });
            }

            return getUploadTransactions(
                selectedUploadId,
                query,
                signal
            );
        },
        [selectedUploadId]
    );

    const transactionColumns: EntityListColumn<Transaction>[] = [
        {
            key: "externalId",
            label: "Transaction",
            sortable: true
        },
        {
            key: "merchantName",
            label: "Merchant",
            sortable: true,
            sortKey: "merchant"
        },
        {
            key: "scheme",
            label: "Scheme",
            sortable: true,
            sortKey: "scheme"
        },
        {
            key: "amount",
            label: "Amount",
            sortable: true,
            render: (transaction) => `${transaction.amount ?? "0"} ${transaction.currencyCode}`
        },
        {
            key: "status",
            label: "Status",
            sortable: true
        },
        {
            key: "qualificationStatus",
            label: "Qualification",
            sortable: true
        },
        {
            key: "estimatedFee",
            label: "Fee",
            render: (transaction) => `${transaction.estimatedFee ?? "0"} ${transaction.currencyCode}`
        },
        {
            key: "anomaly",
            label: "Anomaly",
            render: (transaction) => outlierIds.has(transaction.id) ? (
                <div className="transaction-anomaly-cell">
                    <span>Outlier</span>
                    <Button
                        type="default"
                        className="entity-list-action-button"
                        disabled={confirmedOutlierIds.has(transaction.id)}
                        onClick={() => void confirmOutlier(transaction.id)}
                    >
                        {confirmedOutlierIds.has(transaction.id) ? "Checked" : "Check off"}
                    </Button>
                </div>
            ) : null
        }
    ];

    return (
        <main className="dashboard">
            <div
                className="brand-decoration"
                aria-hidden="true"
            >
                <span className="orb orb-blue orb-one"></span>
                <span className="orb orb-coral orb-two"></span>
                <span className="orb orb-white orb-three"></span>
                <span className="orb orb-blue orb-four"></span>
            </div>

            <section className="content">
                <div className="page-heading">
                    <div>
                        <p className="eyebrow">
                            PAYMENTS WORKSPACE
                        </p>

                        <h2>Upload transactions</h2>

                        <p>
                            Monitor interchange qualification and fees.
                        </p>
                    </div>

                    <div className="page-heading-actions">
                        {selectedUploadId && canEvaluate && (
                            <Tooltip
                                title={isEvaluating ? "Evaluating upload..." : "Evaluate this upload"}
                                color="#f05d53"
                                styles={{ container: { color: "#ffffff" } }}
                            >
                                <span className="action-tooltip-trigger">
                                    <Button
                                        type="primary"
                                        size="large"
                                        className="standard-action-size"
                                        icon={<ExperimentOutlined />}
                                        onClick={() => void runEvaluation()}
                                        disabled={isEvaluating}
                                    >
                                        {isEvaluating ? "Evaluating..." : "Evaluate"}
                                    </Button>
                                </span>
                            </Tooltip>
                        )}

                        {selectedUploadId && canDetectOutliers && (
                            <Tooltip
                                title={isDetectingOutliers ? "Detecting outliers..." : "Detect outliers in this upload"}
                                color="#f05d53"
                                styles={{ container: { color: "#ffffff" } }}
                            >
                                <span className="action-tooltip-trigger">
                                    <Button
                                        type="primary"
                                        size="large"
                                        className="standard-action-size"
                                        onClick={() => void runOutlierDetection()}
                                        disabled={isDetectingOutliers}
                                    >
                                        {isDetectingOutliers ? "Detecting..." : "Detect outliers"}
                                    </Button>
                                </span>
                            </Tooltip>
                        )}

                    </div>
                </div>

                {selectedUploadId && isLoadingStatistics && (
                    <p role="status">Loading upload statistics...</p>
                )}
                {selectedUploadId && statisticsError && (
                    <div className="error-box" role="alert">{statisticsError}</div>
                )}
                {selectedUploadId && uploadStatistics && (
                    <TransactionStats
                        statistics={uploadStatistics}
                    />
                )}

            <section className={`transactions-card${showTransactionFilters ? " transactions-card-filters-visible" : ""}`}>
                    {selectedUploadId ? (
                        <EntityList
                            title={selectedUploadFileName ?? "Transaction list"}
                            description="Transactions imported from this CSV upload."
                            columns={transactionColumns}
                            fetchData={fetchTransactions}
                            onResponse={handleTransactionResponse}
                            expandedItemId={expandedTransactionId}
                            onToggleExpanded={toggleTransactionDetails}
                            expandOnRowClick
                            renderExpanded={(transaction) => {
                                const qualificationStatus = transaction.qualificationStatus?.toUpperCase();
                                const isUnevaluated = transaction.status.toUpperCase() === "NEW"
                                    || qualificationStatus === "NOT_EVALUATED"
                                    || qualificationStatus === "PENDING"
                                    || qualificationStatus === "UNKNOWN";
                                if (isUnevaluated) {
                                    return <TransactionDetails unevaluated />;
                                }
                                if (loadingDetailId === transaction.id) {
                                    return <LoadingState message="Loading qualification details..." />;
                                }
                                if (detailErrors[transaction.id]) {
                                    return <div className="error-box" role="alert">{detailErrors[transaction.id]}</div>;
                                }
                                const details = transactionDetails[transaction.id];
                                return details ? (
                                    <TransactionDetails
                                        details={details}
                                        currency={transaction.currencyCode}
                                        onViewRule={onOpenRule}
                                    />
                                ) : (
                                    <LoadingState message="Loading qualification details..." />
                                );
                            }}
                            reloadKey={transactionReloadKey}
                            initialQuery={{ size: 50, sort: "createdAt,desc" }}
                            toolbar={({ query, updateQuery }) => (
                                <div className="transaction-list-filters">
                                    <Button
                                        type="default"
                                        className="entity-list-filter-button"
                                        aria-expanded={showTransactionFilters}
                                        onClick={() => setShowTransactionFilters((visible) => !visible)}
                                    >
                                        {showTransactionFilters ? "Hide filters" : "Filter"}
                                    </Button>
                                    {showTransactionFilters && <>
                                    <label className="entity-list-filter">
                                        <span>Show</span>
                                        <select
                                            value={query.anomaliesOnly ? "anomalies" : "all"}
                                            onChange={(event) => updateQuery({
                                                anomaliesOnly: event.target.value === "anomalies",
                                                page: 0
                                            })}
                                        >
                                            <option value="all">All transactions</option>
                                            <option value="anomalies">Anomalies only</option>
                                        </select>
                                    </label>
                                    <label className="entity-list-filter">
                                        <span>Order by</span>
                                        <select
                                            value={query.sort}
                                            onChange={(event) => updateQuery({
                                                sort: event.target.value,
                                                page: 0
                                            })}
                                        >
                                            <option value="anomaly,asc">Anomalies first</option>
                                            <option value="createdAt,desc">Newest first</option>
                                            <option value="createdAt,asc">Oldest first</option>
                                            <option value="amount,desc">Amount: high to low</option>
                                            <option value="amount,asc">Amount: low to high</option>
                                            <option value="externalId,asc">Transaction ID: A–Z</option>
                                            <option value="merchant,asc">Merchant: A–Z</option>
                                            <option value="scheme,asc">Scheme: A–Z</option>
                                            <option value="status,asc">Status: A–Z</option>
                                            <option value="qualificationStatus,asc">Qualification: A–Z</option>
                                        </select>
                                    </label>
                                    </>}
                                </div>
                            )}
                            emptyMessage="No transactions available in this CSV upload."
                            rowClassName={(transaction) => outlierIds.has(transaction.id) ? "transaction-anomaly-row" : undefined}
                        />
                    ) : (
                        <div className="empty-state">
                            <p>Select a CSV upload to view its transactions.</p>
                        </div>
                    )}

                    {evaluationError && (
                        <div className="error-box" role="alert">
                            {evaluationError}
                        </div>
                    )}

                    {anomalyError && (
                        <div className="error-box" role="alert">
                            {anomalyError}
                        </div>
                    )}

                </section>
            </section>
            {selectedUploadId && !isAssistantOpen && (
                <Button
                    type="primary"
                    className="assistant-floating-button"
                    onClick={onOpenAssistant}
                    aria-label="Open AI recommendations"
                    title="AI recommendations"
                >
                    AI
                </Button>
            )}
            <RecommendationAssistant
                uploadId={selectedUploadId ?? null}
                fileName={selectedUploadFileName}
                isOpen={isAssistantOpen}
                onClose={onCloseAssistant}
            />
        </main>
    );
}
