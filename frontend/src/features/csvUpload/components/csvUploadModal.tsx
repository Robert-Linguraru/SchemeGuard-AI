import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Flex,
  Modal,
  notification as antdNotification,
  Progress,
  Space,
  Spin,
  Typography,
  Upload,
} from "antd";
import type { UploadFile, UploadProps } from "antd";
import {
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
  InboxOutlined,
  LoadingOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  cancelUpload,
  confirmDuplicateImport,
  downloadDuplicateReport,
  downloadOriginalCsv,
  DuplicateUploadError,
  getTransactionSources,
  UploadImportError,
  uploadCsv,
} from "../api/csvUploadApi";
import type {
  UploadProgress,
  UploadStatusResponse,
} from "../../../types/csvUploadType";
import "./csvUploadModal.css";

const { Dragger } = Upload;

type TransactionUploadModalProps = {
  onCompleted?: (result: UploadStatusResponse) => void;
};

type UploadNotification = {
  kind: "success" | "warning" | "error";
  title: string;
  message: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function saveBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export default function CsvTransactionUploadModal({
  onCompleted,
}: TransactionUploadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [sourceLoadError, setSourceLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [pendingDuplicates, setPendingDuplicates] =
    useState<UploadStatusResponse | null>(null);
  const [completedUpload, setCompletedUpload] =
    useState<UploadStatusResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isResolvingDuplicates, setIsResolvingDuplicates] = useState(false);
  const [isDownloadingDuplicates, setIsDownloadingDuplicates] = useState(false);
  const [isDownloadingOriginal, setIsDownloadingOriginal] = useState(false);
  const [filePickerKey, setFilePickerKey] = useState(0);
  const [notificationApi, notificationContextHolder] = antdNotification.useNotification();
  const abortController = useRef<AbortController | null>(null);
  const requiresDecision = pendingDuplicates !== null;
  const busy = isUploading || isResolvingDuplicates || requiresDecision;

  const resetForm = () => {
    setFile(null);
    setProgress(null);
    setPendingDuplicates(null);
    setCompletedUpload(null);
  };

  const showNotification = (nextNotification: UploadNotification) => {
    notificationApi.destroy();
    notificationApi[nextNotification.kind]({
      placement: "topRight",
      message: nextNotification.title,
      description: nextNotification.message,
      duration: nextNotification.kind === "success" ? 10 : 8,
    });
  };

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const controller = new AbortController();
    setSourceLoadError(null);
    void getTransactionSources(controller.signal)
      .then((values) => setSources(values.map((source) => source.name)))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSourceLoadError(error instanceof Error
            ? error.message
            : "Could not load saved sources. You can still enter a new one.");
        }
      });
    return () => controller.abort();
  }, [isOpen]);

  const openModal = () => {
    resetForm();
    setFilePickerKey((currentKey) => currentKey + 1);
    setIsOpen(true);
  };

  const closeModal = () => {
    if (busy) {
      return;
    }
    setIsOpen(false);
    resetForm();
  };

  const selectFile: UploadProps["beforeUpload"] = (candidate) => {
    if (!candidate.name.toLowerCase().endsWith(".csv")) {
      showNotification({
        kind: "error",
        title: "Invalid file",
        message: "Only .csv files are accepted.",
      });
      return Upload.LIST_IGNORE;
    }

    setFile(candidate);
    setProgress(null);
    setPendingDuplicates(null);
    notificationApi.destroy();
    return false;
  };

  const removeFile = () => {
    if (busy) {
      return false;
    }
    setFile(null);
    setProgress(null);
    setFilePickerKey((currentKey) => currentKey + 1);
    return true;
  };

  const finishImport = (result: UploadStatusResponse, skippedDuplicates = 0) => {
    setProgress({
      phase: "completed",
      completedParts: result.uploadedParts,
      totalParts: result.expectedTotalParts,
      processedRows: result.processedRows,
      status: result.status,
    });
    showNotification({
      kind: "success",
      title: "Import completed",
      message: skippedDuplicates > 0
        ? `Imported ${result.processedRows.toLocaleString()} transactions and skipped ${skippedDuplicates.toLocaleString()} duplicates.`
        : `Imported ${result.processedRows.toLocaleString()} transactions.`,
    });
    setPendingDuplicates(null);
    setCompletedUpload(result);
    onCompleted?.(result);
  };

  const startUpload = async () => {
    if (!file) {
      showNotification({
        kind: "error",
        title: "File required",
        message: "Choose a CSV file first.",
      });
      return;
    }
    if (!sourceName.trim()) {
      showNotification({
        kind: "error",
        title: "Source required",
        message: "Enter or select a bank or transaction source.",
      });
      return;
    }

    const controller = new AbortController();
    abortController.current = controller;
    setIsUploading(true);
    setProgress(null);
    notificationApi.destroy();

    try {
      const result = await uploadCsv(
        file,
        sourceName.trim(),
        setProgress,
        controller.signal,
      );
      if (result.status === "DUPLICATES_FOUND") {
        setProgress(null);
        setPendingDuplicates(result);
        onCompleted?.(result);
        return;
      }
      finishImport(result);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setProgress(null);
        showNotification({
          kind: "warning",
          title: "Upload cancelled",
          message: "The upload was cancelled.",
        });
      } else if (error instanceof DuplicateUploadError) {
        setProgress(null);
        showNotification({
          kind: "warning",
          title: "File already imported",
          message: error.message,
        });
      } else {
        setProgress(null);
        const processedRows = error instanceof UploadImportError
          ? error.processedRows
          : 0;
        const errorMessage = error instanceof Error
          ? error.message
          : "Upload failed.";
        const partial = processedRows > 0;
        showNotification({
          kind: partial ? "warning" : "error",
          title: partial ? "Import partially completed" : "Import failed",
          message: partial
            ? `Imported ${processedRows.toLocaleString()} transactions, but some rows failed. ${errorMessage}`
            : errorMessage,
        });
      }
    } finally {
      setIsUploading(false);
      abortController.current = null;
    }
  };

  const confirmImportWithoutDuplicates = async () => {
    if (!pendingDuplicates) {
      return;
    }
    setIsResolvingDuplicates(true);
    try {
      const result = await confirmDuplicateImport(pendingDuplicates.uploadId);
      if (result.status === "DUPLICATES_FOUND") {
        setPendingDuplicates(result);
        onCompleted?.(result);
        showNotification({
          kind: "warning",
          title: "Duplicate list updated",
          message: "Another import changed the duplicate set. Download the refreshed report and review it before continuing.",
        });
        return;
      }
      if (result.status !== "COMPLETED") {
        throw new Error(result.errorMessage ?? "Could not complete the import.");
      }
      finishImport(result, result.duplicateRows);
    } catch (error) {
      showNotification({
        kind: "error",
        title: "Could not continue import",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsResolvingDuplicates(false);
    }
  };

  const cancelDuplicateReview = async () => {
    if (!pendingDuplicates) {
      return;
    }
    setIsResolvingDuplicates(true);
    try {
      await cancelUpload(pendingDuplicates.uploadId);
      onCompleted?.(pendingDuplicates);
      showNotification({
        kind: "warning",
        title: "Import cancelled",
        message: "No transactions from this file were imported.",
      });
      setIsOpen(false);
      resetForm();
    } catch (error) {
      showNotification({
        kind: "error",
        title: "Could not cancel import",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsResolvingDuplicates(false);
    }
  };

  const downloadDuplicates = async () => {
    if (!pendingDuplicates) {
      return;
    }
    setIsDownloadingDuplicates(true);
    try {
      const report = await downloadDuplicateReport(pendingDuplicates.uploadId);
      const baseName = pendingDuplicates.fileName.replace(/\.[^.]+$/, "");
      saveBlob(report, `${baseName}-duplicates.xlsx`);
    } catch (error) {
      showNotification({
        kind: "error",
        title: "Could not download report",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsDownloadingDuplicates(false);
    }
  };

  const downloadOriginal = async () => {
    if (!completedUpload?.uploadRecordId) {
      return;
    }
    setIsDownloadingOriginal(true);
    try {
      const originalFile = await downloadOriginalCsv(completedUpload.uploadRecordId);
      saveBlob(originalFile, completedUpload.fileName);
    } catch (error) {
      showNotification({
        kind: "error",
        title: "Could not download CSV",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsDownloadingOriginal(false);
    }
  };

  const cancelUploadInProgress = () => {
    abortController.current?.abort();
  };

  const selectedFileList: UploadFile[] = file
    ? [{
        uid: `${file.name}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        status: "done",
        type: file.type,
      }]
    : [];
  const uploadPercent = progress && progress.totalParts > 0
    ? Math.round((progress.completedParts / progress.totalParts) * 100)
    : 0;
  const isProcessing = progress?.phase === "processing";
  const isCompleted = progress?.phase === "completed";
  const progressStatus = isCompleted ? "success" : "active";
  const currentStep = isCompleted ? 3 : isProcessing || requiresDecision ? 2 : isUploading ? 1 : 0;
  const canStartImport = Boolean(file && sourceName.trim()) && !busy;
  const importStages = ["Select file", "Upload", "Processing", "Complete"];

  return (
    <>
      {notificationContextHolder}

      <Button
        type="primary"
        size="large"
        className="standard-action-size"
        icon={<CloudUploadOutlined />}
        onClick={openModal}
      >
        Upload CSV
      </Button>

      <Modal
        open={isOpen}
        centered
        width={640}
        title={(
          <Space align="start" size={12}>
            <CloudUploadOutlined style={{ color: "var(--status-evaluated-text)", fontSize: 24 }} />
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {isCompleted
                  ? "Import completed"
                  : requiresDecision
                    ? "Review duplicate transactions"
                    : "Import transactions"}
              </Typography.Title>
              <Typography.Text type="secondary">
                {isCompleted
                  ? "Your transactions are ready. You can download the original CSV."
                  : requiresDecision
                    ? "Choose whether to import the remaining transactions."
                    : "Upload a CSV file and monitor the import in real time."}
              </Typography.Text>
            </div>
          </Space>
        )}
        onCancel={closeModal}
        closable={!busy}
        mask={{ closable: !busy }}
        keyboard={!busy}
        footer={(
          <Flex justify="space-between" align="center" gap={12} wrap="wrap">
            <Typography.Text type="secondary">
              {requiresDecision
                ? "Duplicate transactions will be skipped if you continue."
                : isCompleted
                  ? "The original CSV is available to download."
                  : isProcessing
                    ? "Validating rows and checking for existing transactions."
                    : isUploading
                      ? "The file is being uploaded in parts."
                      : "CSV files only"}
            </Typography.Text>
            <Space wrap>
              {requiresDecision ? (
                <>
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={() => void cancelDuplicateReview()}
                    loading={isResolvingDuplicates}
                    disabled={isDownloadingDuplicates}
                  >
                    Cancel import
                  </Button>
                  <Button
                    type="primary"
                    icon={<CloudUploadOutlined />}
                    onClick={() => void confirmImportWithoutDuplicates()}
                    loading={isResolvingDuplicates}
                    disabled={isDownloadingDuplicates}
                  >
                    Continue without duplicates
                  </Button>
                </>
              ) : isUploading ? (
                <Button danger icon={<StopOutlined />} onClick={cancelUploadInProgress}>
                  {isProcessing ? "Cancel import" : "Cancel upload"}
                </Button>
              ) : (
                <>
                  <Button onClick={closeModal}>Close</Button>
                  {!isCompleted && (
                    <Button
                      type="primary"
                      icon={<CloudUploadOutlined />}
                      onClick={() => void startUpload()}
                      disabled={!canStartImport}
                    >
                      Start import
                    </Button>
                  )}
                </>
              )}
            </Space>
          </Flex>
        )}
      >
        <Space direction="vertical" size={18} style={{ width: "100%" }}>
          <Flex gap={8} role="list" aria-label="Import status">
            {importStages.map((stage, index) => {
              const isActiveStage = currentStep === index;
              const isFinishedStage = currentStep > index;
              const stageColor = isActiveStage
                ? "var(--coral)"
                : isFinishedStage
                  ? "var(--status-evaluated-text)"
                  : "var(--border)";
              const textColor = isActiveStage
                ? "var(--text-primary)"
                : isFinishedStage
                  ? "var(--status-evaluated-text)"
                  : "var(--text-muted)";

              return (
                <div
                  key={stage}
                  role="listitem"
                  aria-current={isActiveStage ? "step" : undefined}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderTop: `3px solid ${stageColor}`,
                    paddingTop: 8,
                  }}
                >
                  <Typography.Text
                    strong={isActiveStage}
                    style={{ color: textColor, fontSize: 12 }}
                  >
                    {stage}
                  </Typography.Text>
                </div>
              );
            })}
          </Flex>

          {!requiresDecision && !progress && (
            <Dragger
              key={filePickerKey}
              className="csv-upload-dropzone"
              accept=".csv,text/csv"
              multiple={false}
              maxCount={1}
              disabled={busy || isCompleted}
              beforeUpload={selectFile}
              onRemove={removeFile}
              fileList={selectedFileList}
              showUploadList={false}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <Typography.Title level={5} style={{ marginBottom: 8 }}>
                Drop your CSV here or click to browse
              </Typography.Title>
              <Typography.Text type="secondary">
                The original file is stored securely for later download.
              </Typography.Text>
            </Dragger>
          )}

          {!requiresDecision && !progress && (
            <div>
              <Typography.Text strong>Bank / transaction source</Typography.Text>
              <AutoComplete
                value={sourceName}
                options={sources.map((name) => ({ value: name }))}
                onChange={setSourceName}
                placeholder="Type a source or select a saved one"
                filterOption={(input, option) =>
                  String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())
                }
                disabled={busy || isCompleted}
                style={{ width: "100%", marginTop: 8 }}
              />
              <Typography.Text type="secondary">
                Sources are shared between users. Names are matched without case or extra-space differences.
              </Typography.Text>
              {sourceLoadError && (
                <div>
                  <Typography.Text type="warning">{sourceLoadError}</Typography.Text>
                </div>
              )}
            </div>
          )}

          {file && (
            <Card size="small">
              <Flex align="center" gap={12}>
                <FileTextOutlined style={{ color: "var(--status-evaluated-text)", fontSize: 22 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Typography.Text strong ellipsis={{ tooltip: file.name }}>
                    {file.name}
                  </Typography.Text>
                  <br />
                  <Typography.Text type="secondary">
                    {[formatFileSize(file.size), sourceName.trim()]
                      .filter(Boolean)
                      .join(" · ")}
                    {isCompleted && completedUpload?.duplicateRows
                      ? ` · ${completedUpload.duplicateRows.toLocaleString()} duplicates skipped`
                      : isCompleted
                        ? " · Import completed"
                        : ""}
                  </Typography.Text>
                </div>
                {isCompleted && completedUpload?.uploadRecordId ? (
                  <div className="entity-list-actions">
                    <Button
                      type="default"
                      className="entity-list-action-button"
                      icon={<DownloadOutlined />}
                      onClick={() => void downloadOriginal()}
                      loading={isDownloadingOriginal}
                      aria-label="Download original CSV"
                    >
                      Download CSV
                    </Button>
                  </div>
                ) : !busy && !isCompleted ? (
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={removeFile}
                    aria-label="Remove selected file"
                  />
                ) : null}
              </Flex>
            </Card>
          )}

          {pendingDuplicates && (
            <Alert
              showIcon
              type="warning"
              message={`${pendingDuplicates.duplicateRows.toLocaleString()} duplicate transaction${pendingDuplicates.duplicateRows === 1 ? "" : "s"} found`}
              description="Download the Excel report to review the rows. Continuing imports the other transactions and skips these duplicates. Cancel stops the whole import."
              action={(
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => void downloadDuplicates()}
                  loading={isDownloadingDuplicates}
                  disabled={isResolvingDuplicates}
                >
                  Download Excel
                </Button>
              )}
            />
          )}

          {progress && (
            <Card size="small">
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Flex justify="space-between" align="center" gap={12}>
                  <Space size={8}>
                    {isUploading && (
                      <Spin size="small" indicator={<LoadingOutlined spin />} />
                    )}
                    <Typography.Text strong>
                      {isCompleted
                        ? "Import completed"
                        : isProcessing
                          ? "Processing transactions"
                          : "Uploading file parts"}
                    </Typography.Text>
                  </Space>
                  <Typography.Text type="secondary">
                    {isCompleted ? "Completed" : "In progress"}
                  </Typography.Text>
                </Flex>
                {isProcessing ? (
                  <div
                    className="csv-upload-processing-track"
                    role="progressbar"
                    aria-label="Transaction processing is in progress"
                  />
                ) : (
                  <Progress
                    percent={isCompleted ? 100 : uploadPercent}
                    status={progressStatus}
                    showInfo={false}
                  />
                )}
                <Flex justify="space-between" align="center" gap={12}>
                  <Typography.Text
                    type="secondary"
                    aria-live={isProcessing ? "polite" : undefined}
                  >
                    {isProcessing || isCompleted
                      ? `${progress.processedRows.toLocaleString()} transactions processed`
                      : `${progress.completedParts} / ${progress.totalParts} parts sent`}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {isProcessing ? "Updates automatically" : null}
                  </Typography.Text>
                </Flex>
                {isProcessing && (
                  <Typography.Text type="secondary">
                    Validating rows and checking for existing transactions.
                  </Typography.Text>
                )}
              </Space>
            </Card>
          )}
        </Space>
      </Modal>
    </>
  );
}
