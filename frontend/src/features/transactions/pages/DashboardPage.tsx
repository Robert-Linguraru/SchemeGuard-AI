import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../app/AuthProvider";
import { AccountMenu } from "../../../shared/components/AccountMenu";
import { getUploadTransactions } from "../../uploads/api/uploadsApi";
import {
    confirmUploadOutlier,
    detectUploadOutliers,
    evaluateUpload,
    getUploadOutlierIds
} from "../../uploads/api/uploadsApi";
import type { UploadStatistics } from "../../uploads/types/upload";
import {
    getTransactionExplanation,
    type TransactionExplanation
} from "../api/transactionExplanationApi";
import { TransactionStats } from "../components/TransactionStats";
import { EntityList } from "../../../shared/components/EntityList/EntityList";
import type { Transaction } from "../../../shared/types/transaction";
import type {
    EntityListColumn,
    EntityListQuery,
    EntityListResponse
} from "../../../shared/types/list";

interface DashboardPageProps {
    onCreateRule: () => void;
    onOpenRule: (ruleId: string) => void;
    onOpenCardSchemes: () => void;
    onEditProfile: () => void;
    onOpenAnalysisDashboard: () => void;
    selectedUploadId?: string | null;
    selectedUploadFileName?: string | null;
    selectedUploadImportStatus?: string | null;
    selectedUploadWasEvaluated?: boolean;
    onUploadEvaluated: (wasEvaluated: boolean) => void;
    onBackToUploads: () => void;
}

export function DashboardPage({
    onCreateRule,
    onOpenRule,
    onEditProfile,
    onOpenCardSchemes,
    onOpenAnalysisDashboard,
    selectedUploadId,
    selectedUploadFileName,
    selectedUploadImportStatus,
    selectedUploadWasEvaluated = false,
    onUploadEvaluated,
    onBackToUploads
}: DashboardPageProps) {
    const { user } = useAuth();
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [uploadStatistics, setUploadStatistics] = useState<UploadStatistics | null>(null);
    const [isLoadingStatistics, setIsLoadingStatistics] = useState(false);
    const [statisticsError, setStatisticsError] = useState<string | null>(null);

    const [isEvaluating, setIsEvaluating] = useState(false);
    const [evaluationMessage, setEvaluationMessage] = useState<string | null>(null);
    const [evaluationError, setEvaluationError] = useState<string | null>(null);
    const [transactionReloadKey, setTransactionReloadKey] = useState(0);
    const [statisticsReloadKey, setStatisticsReloadKey] = useState(0);

    const canEvaluate = selectedUploadImportStatus === "COMPLETED"
        && !selectedUploadWasEvaluated;
    const canDetectOutliers = selectedUploadImportStatus === "COMPLETED"
        && selectedUploadWasEvaluated;

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

    const runEvaluation = async () => {
        if (!selectedUploadId || !canEvaluate || isEvaluating) {
            return;
        }

        setIsEvaluating(true);
        setEvaluationMessage(null);
        setEvaluationError(null);
        try {
            const result = await evaluateUpload(selectedUploadId);
            setEvaluationMessage(result.message);
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
        (response: EntityListResponse<Transaction>) => {
            detailRequest.current?.abort();
            detailCache.current.clear();
            setExpandedTransactionId(null);
            setTransactionDetails({});
            setDetailErrors({});
            setLoadingDetailId(null);
            setTransactions(response.items);
        },
        []
    );

    const runOutlierDetection = async () => {
        if (!selectedUploadId || !canDetectOutliers || isDetectingOutliers) {
            return;
        }
        setIsDetectingOutliers(true);
        setAnomalyError(null);
        try {
            const result = await detectUploadOutliers(selectedUploadId);
            setOutlierIds(new Set(result.outlierTransactionIds));
            setConfirmedOutlierIds(new Set());
        } catch (requestError: unknown) {
            setAnomalyError(
                requestError instanceof Error
                    ? requestError.message
                    : "Could not detect outliers"
            );
        } finally {
            setIsDetectingOutliers(false);
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
                    <button
                        type="button"
                        className="entity-list-action-button"
                        disabled={confirmedOutlierIds.has(transaction.id)}
                        onClick={() => void confirmOutlier(transaction.id)}
                    >
                        {confirmedOutlierIds.has(transaction.id) ? "Checked" : "Check off"}
                    </button>
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

            <header className="dashboard-header">
                <div className="welcome">
                    <h1>SchemeGuard AI</h1>
                    <p>Welcome, {user?.fullName}</p>
                </div>

                <div className="dashboard-account-actions">
                    <AccountMenu
                        onEditProfile={onEditProfile}
                    />
                </div>
            </header>

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
                        <button
                            type="button"
                            className="dashboard-button"
                            onClick={onOpenAnalysisDashboard}
                        >
                            Analytics
                        </button>

                        {selectedUploadId && canEvaluate && (
                            <button
                                type="button"
                                className="dashboard-button"
                                onClick={() => void runEvaluation()}
                                disabled={isEvaluating}
                            >
                                {isEvaluating ? "Evaluating..." : "Evaluate"}
                            </button>
                        )}

                        <button
                            type="button"
                            className="dashboard-button"
                            onClick={() => void runOutlierDetection()}
                            disabled={!selectedUploadId || !canDetectOutliers || isDetectingOutliers}
                            title={!canDetectOutliers ? "Evaluate this upload before detecting outliers." : undefined}
                        >
                            {isDetectingOutliers ? "Detecting..." : "Detect outliers"}
                        </button>

                        <button
                            type="button"
                            className="dashboard-button"
                            onClick={onOpenCardSchemes}
                        >
                            Card schemes
                        </button>

                        <button
                            type="button"
                            className="dashboard-button"
                            onClick={onBackToUploads}
                        >
                            CSV uploads
                        </button>

                        {isAdmin && (
                            <button
                                className="create-rule-button"
                                onClick={onCreateRule}
                            >
                                View Rules
                            </button>
                        )}
                    </div>
                </div>

                {selectedUploadId && (
                    <TransactionStats
                        transactions={transactions}
                        totalTransactions={totalTransactions}
                    />
                )}

            <section className="transactions-card">
                    {selectedUploadId ? (
                        <EntityList
                            title={selectedUploadFileName ?? "Transaction list"}
                            description="Transactions imported from this CSV upload."
                            columns={transactionColumns}
                            fetchData={fetchTransactions}
                            onResponse={handleTransactionResponse}
                            expandedItemId={expandedTransactionId}
                            onToggleExpanded={toggleTransactionDetails}
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
                                <>
                                    <button
                                        type="button"
                                        className="entity-list-filter-button"
                                        aria-expanded={showTransactionFilters}
                                        onClick={() => setShowTransactionFilters((visible) => !visible)}
                                    >
                                        {showTransactionFilters ? "Hide filters" : "Filter"}
                                    </button>
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
                                </>
                            )}
                            emptyMessage="No transactions available in this CSV upload."
                            rowClassName={(transaction) => outlierIds.has(transaction.id) ? "transaction-anomaly-row" : undefined}
                        />
                    ) : (
                        <div className="empty-state">
                            <p>Select a CSV upload to view its transactions.</p>
                        </div>
                    )}

                    {evaluationMessage && (
                        <div className="success-box" role="status">
                            {evaluationMessage}
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
        </main>
    );
}
