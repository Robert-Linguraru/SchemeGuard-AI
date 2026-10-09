import { useCallback, useState } from "react";
import CsvTransactionUploadModal from "../../csvUpload/components/csvUploadModal";
import {
    deleteUploadDocument,
    downloadUpload,
    evaluateUpload,
    getUploads
} from "../api/uploadsApi";
import type { UploadSummary } from "../types/upload";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { EntityList } from "../../../shared/components/EntityList/EntityList";
import type { EntityListColumn, EntityListQuery } from "../../../shared/types/list";
import {
    App as AntdApp,
    Alert,
    Button,
    Flex,
    Modal,
    Space,
    Tooltip,
} from "antd";
import {
    DeleteOutlined,
    DownloadOutlined,
    ExperimentOutlined,
    RightOutlined,
    WarningOutlined,

} from "@ant-design/icons";
import {
    cancelUpload,
    confirmDuplicateImport,
    downloadDuplicateReport,
} from "../../csvUpload/api/csvUploadApi";

interface UploadsPageProps {
    onOpenUpload: (
        uploadId: string,
        fileName: string,
        importStatus: string,
        wasEvaluated: boolean
    ) => void;
    selectedUploadId?: string | null;
}

const formatUploadedAt = (uploadedAt: string) => {
    const date = new Date(uploadedAt);
    return Number.isNaN(date.getTime()) ? uploadedAt : date.toLocaleString();
};

const statusClassName = (status: string) => {
    const normalizedStatus = status.toUpperCase();
    if (normalizedStatus === "COMPLETED" || normalizedStatus === "EVALUATED") {
        return "entity-list-status active";
    }
    if (normalizedStatus === "NOT_EVALUATED" || normalizedStatus === "UPLOADING") {
        return "entity-list-status not-evaluated";
    }
    return "entity-list-status inactive";
};

const getDownloadFileName = (contentDisposition: string | null): string | null => {
    if (!contentDisposition) {
        return null;
    }

    const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (encodedMatch?.[1]) {
        try {
            return decodeURIComponent(encodedMatch[1].trim().replace(/^"|"$/g, ""));
        } catch {
            return null;
        }
    }

    const fileNameMatch = contentDisposition.match(/filename="([^"]+)"|filename=([^;]+)/i);
    return fileNameMatch?.[1]?.trim() || fileNameMatch?.[2]?.trim() || null;
};

const createColumns = (
    onOpenUpload: UploadsPageProps["onOpenUpload"],
    evaluatingUploadId: string | null,
    onEvaluateUpload: (uploadId: string) => void,
    downloadingUploadId: string | null,
    onDownloadUpload: (uploadId: string, fileName: string) => void,
    onReviewDuplicates: (upload: UploadSummary) => void,
    deletingUploadId: string | null,
    onDeleteUpload: (upload: UploadSummary) => void
): EntityListColumn<UploadSummary>[] => [
    {
        key: "fileName",
        label: "File name",
        sortable: true
    },
    {
        key: "sourceName",
        label: "Source",
        sortable: true,
        render: (upload) => upload.sourceName ?? "—"
    },
    {
        key: "uploadedAt",
        label: "Uploaded",
        sortable: true,
        render: (upload) => formatUploadedAt(upload.uploadedAt)
    },
    {
        key: "importStatus",
        label: "Import status",
        align: "center",
        render: (upload) => (
            <span className={statusClassName(upload.importStatus)}>
                {upload.importStatus}
            </span>
        )
    },
    {
        key: "evaluationStatus",
        label: "Evaluation status",
        align: "center",
        render: (upload) => (
            <span className={evaluatingUploadId === upload.id
                ? "entity-list-status evaluating"
                : statusClassName(upload.evaluationStatus)}>
                {evaluatingUploadId === upload.id ? "EVALUATING" : upload.evaluationStatus}
            </span>
        )
    },
    {
        key: "transactionCount",
        label: "Transactions",
        align: "center",
        sortable: true
    },
    {
        key: "actions",
        label: "Actions",
        render: (upload) => (
            <div className="entity-list-actions">
                {upload.importStatus !== "DUPLICATE" && (
                    <Tooltip
                        title={downloadingUploadId === upload.id ? "Downloading original CSV..." : "Download CSV"}
                        color="#FF5640"
                        styles={{ container: { color: "#ffffff" } }}
                    >
                        <span className="entity-list-action-tooltip">
                            <Button
                                type="default"
                                className={`entity-list-action-button entity-list-action-icon-button${downloadingUploadId === upload.id ? " download-in-progress" : ""}`}
                                icon={<DownloadOutlined />}
                                disabled={downloadingUploadId === upload.id}
                                onClick={() => onDownloadUpload(upload.id, upload.fileName)}
                                aria-label={downloadingUploadId === upload.id ? "Downloading original CSV" : "Download original CSV"}
                            />
                        </span>
                    </Tooltip>
                )}
                {upload.importStatus === "COMPLETED" && !upload.wasEvaluated && (
                    <Tooltip
                        title={evaluatingUploadId === upload.id ? "Evaluating upload..." : "Evaluate"}
                        color="#FF5640"
                        styles={{ container: { color: "#ffffff" } }}
                    >
                        <span className="entity-list-action-tooltip">
                            <Button
                                type="primary"
                                className="entity-list-action-icon-button"
                                icon={<ExperimentOutlined />}
                                disabled={evaluatingUploadId === upload.id}
                                onClick={() => onEvaluateUpload(upload.id)}
                                aria-label="Evaluate upload"
                            />
                        </span>
                    </Tooltip>
                )}
                {upload.importStatus === "DUPLICATES_FOUND" && (
                    <Tooltip
                        title="Review duplicate transactions"
                        color="#f05d53"
                        styles={{ container: { color: "#ffffff" } }}
                    >
                        <span className="entity-list-action-tooltip">
                            <Button
                                type="primary"
                                className="entity-list-action-icon-button"
                                icon={<WarningOutlined />}
                                onClick={() => onReviewDuplicates(upload)}
                                aria-label="Review duplicate transactions"
                            />
                        </span>
                    </Tooltip>
                )}
                <Tooltip
                    title={deletingUploadId === upload.id ? "Deleting document..." : "Delete document"}
                    color="var(--danger-button-bg)"
                    styles={{ container: { color: "#ffffff" } }}
                >
                    <span className="entity-list-action-tooltip">
                        <Button
                            type="default"
                            danger
                            className="entity-list-action-button entity-list-action-icon-button entity-list-action-danger"
                            icon={<DeleteOutlined />}
                            loading={deletingUploadId === upload.id}
                            disabled={deletingUploadId !== null}
                            onClick={() => onDeleteUpload(upload)}
                            aria-label="Delete uploaded document and its transactions"
                        />
                    </span>
                </Tooltip>
                {upload.importStatus !== "DUPLICATES_FOUND" && (
                    <Tooltip
                        title="Open Details"
                        color="#FF5640"
                        styles={{ container: { color: "#ffffff" } }}
                    >
                        <span className="entity-list-action-tooltip">
                            <Button
                                type="default"
                                className="entity-list-action-button entity-list-action-icon-button"
                                icon={<RightOutlined />}
                                onClick={() => onOpenUpload(
                                    upload.id,
                                    upload.fileName,
                                    upload.importStatus,
                                    upload.wasEvaluated
                                )}
                                aria-label="Open upload details"
                            />
                        </span>
                    </Tooltip>
                )}
            </div>
        )
    }
];

export function UploadsPage({
    onOpenUpload,
    selectedUploadId
}: UploadsPageProps) {
    const { modal, notification } = AntdApp.useApp();
    const [reloadKey, setReloadKey] = useState(0);
    const [evaluatingUploadId, setEvaluatingUploadId] = useState<string | null>(null);
    const [evaluationError, setEvaluationError] = useState<string | null>(null);
    const [downloadingUploadId, setDownloadingUploadId] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
    const [reviewingUpload, setReviewingUpload] = useState<UploadSummary | null>(null);
    const [isResolvingDuplicates, setIsResolvingDuplicates] = useState(false);
    const [isDownloadingDuplicateReport, setIsDownloadingDuplicateReport] = useState(false);
    const columns = createColumns(
        onOpenUpload,
        evaluatingUploadId,
        async (uploadId) => {
        setEvaluatingUploadId(uploadId);
        setEvaluationError(null);
        try {
            await evaluateUpload(uploadId);
            notification.success({
                placement: "topRight",
                message: "Evaluation complete",
                description: "The upload has been evaluated successfully."
            });
            setReloadKey((currentKey) => currentKey + 1);
        } catch (requestError: unknown) {
            setEvaluationError(
                requestError instanceof Error
                    ? requestError.message
                    : "Could not evaluate this upload"
            );
        } finally {
            setEvaluatingUploadId(null);
        }
        },
        downloadingUploadId,
        async (uploadId, fallbackFileName) => {
            setDownloadingUploadId(uploadId);
            setDownloadError(null);
            let responseFileName: string | null = null;
            try {
                const blob = await downloadUpload(
                    uploadId,
                    undefined,
                    (response) => {
                        responseFileName = getDownloadFileName(
                            response.headers.get("Content-Disposition")
                        );
                    }
                );
                const objectUrl = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = objectUrl;
                anchor.download = responseFileName || fallbackFileName || "original-file.csv";
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
            } catch (requestError: unknown) {
                setDownloadError(
                    requestError instanceof Error
                        ? requestError.message
                        : "Could not download this upload"
                );
            } finally {
                setDownloadingUploadId(null);
            }
        },
        (upload) => setReviewingUpload(upload),
        deletingUploadId,
        (upload) => {
            modal.confirm({
                className: "upload-delete-confirm",
                title: `Delete ${upload.fileName}?`,
                content: `This permanently deletes the document and all ${upload.transactionCount.toLocaleString()} associated transaction${upload.transactionCount === 1 ? "" : "s"}, including their analysis results. This cannot be undone.`,
                okText: "Delete permanently",
                cancelText: "Cancel",
                okButtonProps: { danger: true },
                onOk: async () => {
                    setDeletingUploadId(upload.id);
                    try {
                        await deleteUploadDocument(upload.id);
                        notification.success({
                            placement: "topRight",
                            message: "Document deleted",
                            description: `${upload.fileName} and its transactions were deleted.`
                        });
                        setReloadKey((currentKey) => currentKey + 1);
                    } catch (requestError: unknown) {
                        notification.error({
                            placement: "topRight",
                            message: "Could not delete document",
                            description: requestError instanceof Error
                                ? requestError.message
                                : "Please try again."
                        });
                    } finally {
                        setDeletingUploadId(null);
                    }
                }
            });
        }
    );

    const fetchUploads = useCallback(
        (query: EntityListQuery, signal?: AbortSignal) => getUploads(query, signal),
        []
    );

    const downloadDuplicateWorkbook = async () => {
        if (!reviewingUpload) {
            return;
        }
        setIsDownloadingDuplicateReport(true);
        try {
            const blob = await downloadDuplicateReport(reviewingUpload.sessionId);
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = `${reviewingUpload.fileName.replace(/\.[^.]+$/, "")}-duplicates.xlsx`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        } catch (requestError: unknown) {
            notification.error({
                placement: "topRight",
                message: "Unable to download duplicate report",
                description: requestError instanceof Error
                    ? requestError.message
                    : "Please try again."
            });
        } finally {
            setIsDownloadingDuplicateReport(false);
        }
    };

    const continueWithoutDuplicates = async () => {
        if (!reviewingUpload) {
            return;
        }
        setIsResolvingDuplicates(true);
        try {
            const result = await confirmDuplicateImport(reviewingUpload.sessionId);
            if (result.status === "DUPLICATES_FOUND") {
                setReviewingUpload({
                    ...reviewingUpload,
                    duplicateRows: result.duplicateRows
                });
                notification.warning({
                    placement: "topRight",
                    message: "Duplicate list updated",
                    description: "Another import changed this report. Download the updated workbook and review it before continuing."
                });
                return;
            }
            if (result.status !== "COMPLETED") {
                throw new Error(result.errorMessage ?? "Could not complete this import.");
            }
            notification.success({
                placement: "topRight",
                message: "Import completed",
                description: `Imported ${result.processedRows.toLocaleString()} transactions and skipped ${result.duplicateRows.toLocaleString()} duplicates.`
            });
            setReviewingUpload(null);
            setReloadKey((currentKey) => currentKey + 1);
        } catch (requestError: unknown) {
            notification.error({
                placement: "topRight",
                message: "Could not continue import",
                description: requestError instanceof Error
                    ? requestError.message
                    : "Please try again."
            });
        } finally {
            setIsResolvingDuplicates(false);
        }
    };

    const cancelDuplicateUpload = async () => {
        if (!reviewingUpload) {
            return;
        }
        setIsResolvingDuplicates(true);
        try {
            await cancelUpload(reviewingUpload.sessionId);
            notification.info({
                placement: "topRight",
                message: "Import cancelled",
                description: "No transactions from this file were imported."
            });
            setReviewingUpload(null);
            setReloadKey((currentKey) => currentKey + 1);
        } catch (requestError: unknown) {
            notification.error({
                placement: "topRight",
                message: "Could not cancel import",
                description: requestError instanceof Error
                    ? requestError.message
                    : "Please try again."
            });
        } finally {
            setIsResolvingDuplicates(false);
        }
    };

    return (
        <main className="dashboard uploads-page" data-selected-upload-id={selectedUploadId ?? undefined}>
            <div className="brand-decoration" aria-hidden="true">
                <span className="orb orb-blue orb-one"></span>
                <span className="orb orb-coral orb-two"></span>
                <span className="orb orb-white orb-three"></span>
                <span className="orb orb-blue orb-four"></span>
            </div>

            <section className="content">
                <div className="page-heading">
                    <div>
                        <p className="eyebrow">UPLOADS WORKSPACE</p>
                        <h2>CSV uploads</h2>
                        <p>Upload transaction files and review their import history.</p>
                    </div>

                    <div className="page-heading-actions">
                        <CsvTransactionUploadModal
                            onCompleted={() => setReloadKey((currentKey) => currentKey + 1)}
                        />
                    </div>
                </div>

                <EntityList
                    title="Upload history"
                    description="Review every CSV document submitted to SchemeGuard AI."
                    columns={columns}
                    fetchData={fetchUploads}
                    reloadKey={reloadKey}
                    initialQuery={{ sort: "uploadedAt,desc" }}
                    searchPlaceholder="Search by file name..."
                    emptyMessage={"No CSV files uploaded yet.\nUpload a CSV file to begin."}
                />
                <Modal
                    open={reviewingUpload !== null}
                    centered
                    title="Review duplicate transactions"
                    onCancel={() => {
                        if (!isResolvingDuplicates && !isDownloadingDuplicateReport) {
                            setReviewingUpload(null);
                        }
                    }}
                    closable={!isResolvingDuplicates && !isDownloadingDuplicateReport}
                    mask={{ closable: !isResolvingDuplicates && !isDownloadingDuplicateReport }}
                    footer={(
                        <Flex justify="space-between" align="center" gap={12} style={{ width: "100%" }}>
                            <Button
                                danger
                                icon={<WarningOutlined />}
                                onClick={() => void cancelDuplicateUpload()}
                                loading={isResolvingDuplicates}
                                disabled={isDownloadingDuplicateReport}
                            >
                                Cancel import
                            </Button>
                            <Button
                                type="primary"
                                onClick={() => void continueWithoutDuplicates()}
                                loading={isResolvingDuplicates}
                                disabled={isDownloadingDuplicateReport}
                            >
                                Continue without duplicates
                            </Button>
                        </Flex>
                    )}
                >
                    {reviewingUpload && (
                        <Alert
                            showIcon
                            type="warning"
                            message={`${reviewingUpload.duplicateRows.toLocaleString()} duplicate transaction${reviewingUpload.duplicateRows === 1 ? "" : "s"} found in ${reviewingUpload.fileName}`}
                            description="Download the Excel report to review the rows. Continuing imports the other transactions and skips these duplicates. Cancel stops the whole import."
                            action={(
                                <Button
                                    size="small"
                                    className="duplicate-download-button"
                                    icon={<DownloadOutlined />}
                                    onClick={() => void downloadDuplicateWorkbook()}
                                    loading={isDownloadingDuplicateReport}
                                    disabled={isResolvingDuplicates}
                                >
                                    Download Excel
                                </Button>
                            )}
                        />
                    )}
                </Modal>
                {evaluationError && (
                    <ErrorMessage title="Unable to evaluate upload" message={evaluationError} />
                )}
            </section>
        </main>
    );
}
