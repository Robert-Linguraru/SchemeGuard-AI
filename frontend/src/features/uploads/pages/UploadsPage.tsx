import { useCallback, useState } from "react";
import CsvTransactionUploadModal from "../../csvUpload/components/csvUploadModal";
import { downloadUpload, evaluateUpload, getUploads } from "../api/uploadsApi";
import type { UploadSummary } from "../types/upload";
import { ErrorMessage } from "../../../shared/components/ErrorMessage";
import { EntityList } from "../../../shared/components/EntityList/EntityList";
import type { EntityListColumn, EntityListQuery } from "../../../shared/types/list";
import { UploadComparisonModal } from "../../transactions/components/UploadComparisonModal";
import {
  App as AntdApp,
  Button,
  Tooltip,
} from "antd";
import {
    DownloadOutlined,
    ExperimentOutlined,
    RightOutlined,

} from "@ant-design/icons";

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
    onDownloadUpload: (uploadId: string, fileName: string) => void
): EntityListColumn<UploadSummary>[] => [
    {
        key: "fileName",
        label: "File name",
        sortable: true
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
                        color="#f05d53"
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
                <Tooltip
                    title="Open Details"
                    color="#f05d53"
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
                {upload.importStatus === "COMPLETED" && !upload.wasEvaluated && (
                    <Tooltip
                        title={evaluatingUploadId === upload.id ? "Evaluating upload..." : "Evaluate"}
                        color="#f05d53"
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
            </div>
        )
    }
];

export function UploadsPage({
    onOpenUpload,
    selectedUploadId
}: UploadsPageProps) {
    const { notification } = AntdApp.useApp();
    const [reloadKey, setReloadKey] = useState(0);
    const [evaluatingUploadId, setEvaluatingUploadId] = useState<string | null>(null);
    const [evaluationError, setEvaluationError] = useState<string | null>(null);
    const [downloadingUploadId, setDownloadingUploadId] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);
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
        }
    );

    const fetchUploads = useCallback(
        (query: EntityListQuery, signal?: AbortSignal) => getUploads(query, signal),
        []
    );

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
                        <UploadComparisonModal />
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
                {evaluationError && (
                    <ErrorMessage title="Unable to evaluate upload" message={evaluationError} />
                )}
            </section>
        </main>
    );
}
