import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Select, Spin } from "antd";
import { ApiError } from "../../../shared/api/ApiError";
import { getAllUploads, getUploadAnomalyJob, getUploadOutlierIds, getUploadStatistics } from "../../uploads/api/uploadsApi";
import type { AnomalyJobResponse } from "../../uploads/api/uploadsApi";
import type { UploadStatistics, UploadSummary } from "../../uploads/types/upload";

type AnomalyStatus = AnomalyJobResponse["status"] | "NOT_REQUESTED";

interface UploadComparison {
    statistics: UploadStatistics;
    anomalyStatus: AnomalyStatus;
    anomalyCount: number | null;
}

const formatCount = (value: number) => new Intl.NumberFormat("en-US").format(value);
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatFees = (value: number) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format(value);
const formatSignedCount = (value: number) => `${value > 0 ? "+" : ""}${formatCount(value)}`;
const formatSignedFees = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatFees(Math.abs(value))}`;
const formatSignedPoints = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)} pp`;
const formatUploadDate = (value: string) => new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short"
}).format(new Date(value));

const anomalyLabel = (comparison: UploadComparison) => {
    switch (comparison.anomalyStatus) {
        case "COMPLETED":
            return `${formatCount(comparison.anomalyCount ?? 0)} detected`;
        case "PENDING":
        case "RUNNING":
            return "Detection in progress";
        case "FAILED":
            return "Detection failed";
        default:
            return "Not run";
    }
};

async function loadUploadComparison(upload: UploadSummary, signal: AbortSignal): Promise<UploadComparison> {
    const [statistics, anomalyJob] = await Promise.all([
        getUploadStatistics(upload.id, signal),
        getUploadAnomalyJob(upload.id, signal).catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
        })
    ]);

    const anomalyStatus = anomalyJob?.status ?? "NOT_REQUESTED";
    const anomalyIds = anomalyStatus === "COMPLETED"
        ? await getUploadOutlierIds(upload.id, signal)
        : null;

    return {
        statistics,
        anomalyStatus,
        anomalyCount: anomalyIds?.length ?? null
    };
}

export function UploadComparisonPanel() {
    const [uploads, setUploads] = useState<UploadSummary[]>([]);
    const [firstUploadId, setFirstUploadId] = useState("");
    const [secondUploadId, setSecondUploadId] = useState("");
    const [isLoadingUploads, setIsLoadingUploads] = useState(true);
    const [isComparing, setIsComparing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [comparison, setComparison] = useState<[UploadComparison, UploadComparison] | null>(null);
    const comparisonRequest = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoadingUploads(true);
        void getAllUploads(controller.signal)
            .then((allUploads) => {
                if (controller.signal.aborted) return;
                const comparableUploads = allUploads.filter((upload) =>
                    upload.importStatus === "COMPLETED" && upload.wasEvaluated
                );
                setUploads(comparableUploads);
                setFirstUploadId(comparableUploads[0]?.id ?? "");
                setSecondUploadId(comparableUploads[1]?.id ?? "");
            })
            .catch((requestError: unknown) => {
                if (!controller.signal.aborted) {
                    setError(requestError instanceof Error
                        ? requestError.message
                        : "Could not load completed uploads.");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoadingUploads(false);
            });

        return () => controller.abort();
    }, []);

    useEffect(() => () => comparisonRequest.current?.abort(), []);

    const uploadOptions = useMemo(() => uploads.map((upload) => ({
        value: upload.id,
        label: `${upload.fileName} · ${formatUploadDate(upload.uploadedAt)}`
    })), [uploads]);

    const firstUpload = uploads.find((upload) => upload.id === firstUploadId) ?? null;
    const secondUpload = uploads.find((upload) => upload.id === secondUploadId) ?? null;

    const compare = async () => {
        if (!firstUpload || !secondUpload || firstUpload.id === secondUpload.id) return;
        comparisonRequest.current?.abort();
        const controller = new AbortController();
        comparisonRequest.current = controller;
        setIsComparing(true);
        setError(null);

        try {
            const result = await Promise.all([
                loadUploadComparison(firstUpload, controller.signal),
                loadUploadComparison(secondUpload, controller.signal)
            ]);
            if (!controller.signal.aborted) setComparison(result);
        } catch (requestError: unknown) {
            if (!controller.signal.aborted) {
                setComparison(null);
                setError(requestError instanceof Error
                    ? requestError.message
                    : "Could not compare the selected uploads.");
            }
        } finally {
            if (comparisonRequest.current === controller) {
                comparisonRequest.current = null;
                setIsComparing(false);
            }
        }
    };

    const hasTwoUploads = uploads.length >= 2;
    const canCompare = Boolean(firstUpload && secondUpload && firstUpload.id !== secondUpload.id);

    return (
        <Card className="analysis-card analysis-comparison-card">
            <div className="analysis-card-heading">
                <div>
                    <h3>Compare uploads</h3>
                </div>
            </div>

            {error && <Alert className="analysis-comparison-error" type="error" showIcon message={error} />}

            <div className="analysis-comparison-controls">
                <label>
                    <span>First upload</span>
                    <Select
                        showSearch
                        optionFilterProp="label"
                        value={firstUploadId || undefined}
                        options={uploadOptions}
                        loading={isLoadingUploads}
                        placeholder="Select an upload"
                        onChange={(value) => setFirstUploadId(value)}
                        disabled={!hasTwoUploads || isComparing}
                    />
                </label>
                <label>
                    <span>Second upload</span>
                    <Select
                        showSearch
                        optionFilterProp="label"
                        value={secondUploadId || undefined}
                        options={uploadOptions}
                        loading={isLoadingUploads}
                        placeholder="Select another upload"
                        onChange={(value) => setSecondUploadId(value)}
                        disabled={!hasTwoUploads || isComparing}
                    />
                </label>
                <Button
                    type="primary"
                    onClick={() => void compare()}
                    disabled={!canCompare || isComparing || isLoadingUploads}
                    loading={isComparing}
                >
                    Compare
                </Button>
            </div>

            {!isLoadingUploads && !error && !hasTwoUploads && (
                <p className="analysis-empty">Upload and evaluate at least two CSV files to compare them.</p>
            )}

            {isLoadingUploads && <div className="analysis-comparison-loading"><Spin /><span>Loading evaluated uploads...</span></div>}

            {comparison && (
                <div className="analysis-comparison-results">
                    <div className="analysis-comparison-table-wrap">
                        <table className="analysis-comparison-table">
                            <thead>
                                <tr><th>Metric</th><th>First upload</th><th>Second upload</th><th>Change</th></tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <th scope="row">Transactions</th>
                                    <td>{formatCount(comparison[0].statistics.totalTransactions)}</td>
                                    <td>{formatCount(comparison[1].statistics.totalTransactions)}</td>
                                    <td><span className="analysis-comparison-delta">{formatSignedCount(comparison[1].statistics.totalTransactions - comparison[0].statistics.totalTransactions)}</span></td>
                                </tr>
                                <tr>
                                    <th scope="row">Evaluated transactions</th>
                                    <td>{formatCount(comparison[0].statistics.processedTransactions)}</td>
                                    <td>{formatCount(comparison[1].statistics.processedTransactions)}</td>
                                    <td><span className="analysis-comparison-delta">{formatSignedCount(comparison[1].statistics.processedTransactions - comparison[0].statistics.processedTransactions)}</span></td>
                                </tr>
                                <tr>
                                    <th scope="row">Qualification rate</th>
                                    <td>{formatPercent(Number(comparison[0].statistics.qualificationRate) * 100)}</td>
                                    <td>{formatPercent(Number(comparison[1].statistics.qualificationRate) * 100)}</td>
                                    <td><span className="analysis-comparison-delta">{formatSignedPoints((Number(comparison[1].statistics.qualificationRate) - Number(comparison[0].statistics.qualificationRate)) * 100)}</span></td>
                                </tr>
                                <tr>
                                    <th scope="row">Calculated fees (EUR)</th>
                                    <td>{formatFees(Number(comparison[0].statistics.totalFees))}</td>
                                    <td>{formatFees(Number(comparison[1].statistics.totalFees))}</td>
                                    <td><span className="analysis-comparison-delta">{formatSignedFees(Number(comparison[1].statistics.totalFees) - Number(comparison[0].statistics.totalFees))}</span></td>
                                </tr>
                                <tr>
                                    <th scope="row">Detected anomalies</th>
                                    <td>{anomalyLabel(comparison[0])}</td>
                                    <td>{anomalyLabel(comparison[1])}</td>
                                    <td>
                                        {comparison.every((item) => item.anomalyStatus === "COMPLETED")
                                            ? <span className="analysis-comparison-delta">{formatSignedCount((comparison[1].anomalyCount ?? 0) - (comparison[0].anomalyCount ?? 0))}</span>
                                            : "—"}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </Card>
    );
}
