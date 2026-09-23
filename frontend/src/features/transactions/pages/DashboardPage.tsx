import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../app/AuthProvider";
import { AccountMenu } from "../../../shared/components/AccountMenu";
import { isAbortError } from "../../../shared/api/httpClient";
import { LoadingState } from "../../../shared/components/LoadingState";
import type { Transaction } from "../../../shared/types/transaction";
import {
    evaluateUpload,
    getUploadStatistics,
    getUploadTransactions
} from "../../uploads/api/uploadsApi";
import type { UploadStatistics } from "../../uploads/types/upload";
import {
    getTransactionExplanation,
    type TransactionExplanation
} from "../api/transactionExplanationApi";
import { TransactionStats } from "../components/TransactionStats";
import CsvTransactionUploadModal from "../../csvUpload/components/csvUploadModal";
import { EntityList } from "../../../shared/components/EntityList/EntityList";
import type {
    EntityListColumn,
    EntityListQuery
} from "../../../shared/types/list";

interface DashboardPageProps {
    onCreateRule: () => void;
    onOpenCardSchemes: () => void;
    onEditProfile: () => void;
    onOpenAnalysisDashboard: () => void;
    onOpenAssistant: (transactions: Transaction[]) => void;
    isAssistantOpen: boolean;
    selectedUploadId?: string | null;
    selectedUploadFileName?: string | null;
    selectedUploadImportStatus?: string | null;
    selectedUploadWasEvaluated?: boolean;
    onUploadEvaluated: (wasEvaluated: boolean) => void;
    onBackToUploads: () => void;
}

export function DashboardPage({
    onCreateRule,
    onEditProfile,
    onOpenCardSchemes,
    onOpenAnalysisDashboard,
    onOpenAssistant,
    isAssistantOpen,
    selectedUploadId,
    selectedUploadFileName,
    selectedUploadImportStatus,
    selectedUploadWasEvaluated = false,
    onUploadEvaluated,
    onBackToUploads
}: DashboardPageProps) {
    const { user } = useAuth();
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";
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
            setStatisticsReloadKey((key) => key + 1);
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
        if (!selectedUploadId) {
            setUploadStatistics(null);
            setStatisticsError(null);
            return;
        }

        const controller = new AbortController();
        let isMounted = true;
        setIsLoadingStatistics(true);
        setStatisticsError(null);

        getUploadStatistics(selectedUploadId, controller.signal)
            .then(setUploadStatistics)
            .catch((requestError: unknown) => {
                if (!isMounted || isAbortError(requestError)) {
                    return;
                }
                setStatisticsError(
                    requestError instanceof Error
                        ? requestError.message
                        : "Could not load upload statistics"
                );
            })
            .finally(() => {
                if (isMounted && !controller.signal.aborted) {
                    setIsLoadingStatistics(false);
                }
            });

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [selectedUploadId, statisticsReloadKey]);

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
                query.page,
                query.size,
                signal
            );
        },
        [selectedUploadId]
    );

    const transactionColumns: EntityListColumn<Transaction>[] = [
        {
            key: "externalId",
            label: "Transaction"
        },
        {
            key: "merchantName",
            label: "Merchant"
        },
        {
            key: "scheme",
            label: "Scheme"
        },
        {
            key: "amount",
            label: "Amount",
            render: (transaction) => `${transaction.amount ?? "0"} ${transaction.currencyCode}`
        },
        {
            key: "status",
            label: "Status"
        },
        {
            key: "qualificationStatus",
            label: "Qualification"
        },
        {
            key: "estimatedFee",
            label: "Fee",
            render: (transaction) => `${transaction.estimatedFee ?? "0"} ${transaction.currencyCode}`
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
                    <span className="role-badge">
                        {user?.status} · MERCHANT
                    </span>

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

                        <h2>Transaction overview</h2>

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
                            Dashboard
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
                            onClick={onOpenCardSchemes}
                        >
                            Card schemes
                        </button>

                        <CsvTransactionUploadModal />

                        <button
                            type="button"
                            className="dashboard-button"
                            onClick={onBackToUploads}
                        >
                            Back to uploads
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
                        statistics={uploadStatistics}
                        isLoading={isLoadingStatistics}
                        error={statisticsError}
                    />
                )}

                <section className="transactions-card">
                    {selectedUploadId ? (
                        <EntityList
                            title={selectedUploadFileName ?? "Transaction list"}
                            description="Transactions imported from this CSV upload."
                            columns={transactionColumns}
                            fetchData={fetchTransactions}
                            reloadKey={transactionReloadKey}
                            initialQuery={{ size: 50, sort: "createdAt,desc" }}
                            emptyMessage="No transactions available in this CSV upload."
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

                </section>
            </section>
            {!isAssistantOpen && (
                <button
                    type="button"
                    className="assistant-floating-button"
                    onClick={() => onOpenAssistant(transactions)}
                    aria-label="Open AI recommendations"
                    title="AI recommendations"
                >
                    AI
                </button>
            )}
        </main>
    );
}
