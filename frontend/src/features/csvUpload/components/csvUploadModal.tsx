import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Flex,
  Modal,
  notification as antdNotification,
  Progress,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { UploadFile, UploadProps } from "antd";
import {
  CloudUploadOutlined,
  DeleteOutlined,
  FileTextOutlined,
  InboxOutlined,
  LoadingOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  DuplicateUploadError,
  UploadImportError,
  uploadCsv,
} from "../api/csvUploadApi";
import type {
  UploadProgress,
  UploadStatusResponse,
} from "../../../types/csvUploadType";

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

export default function CsvTransactionUploadModal({
  onCompleted,
}: TransactionUploadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [filePickerKey, setFilePickerKey] = useState(0);
  const [notificationApi, notificationContextHolder] = antdNotification.useNotification();
  const abortController = useRef<AbortController | null>(null);
  const resetTimer = useRef<number | null>(null);

  const clearTimers = () => {
    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  };

  const resetForm = () => {
    setFile(null);
    setProgress(null);
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

  useEffect(() => () => clearTimers(), []);

  const openModal = () => {
    clearTimers();
    resetForm();
    setFilePickerKey((currentKey) => currentKey + 1);
    setIsOpen(true);
  };

  const closeModal = () => {
    if (isUploading) {
      return;
    }
    clearTimers();
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
    notificationApi.destroy();
    return false;
  };

  const removeFile = () => {
    if (isUploading) {
      return false;
    }
    setFile(null);
    setProgress(null);
    setFilePickerKey((currentKey) => currentKey + 1);
    return true;
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

    const controller = new AbortController();
    abortController.current = controller;
    setIsUploading(true);
    setProgress(null);
    notificationApi.destroy();

    try {
      const result = await uploadCsv(file, setProgress, controller.signal);
      const importedMessage = `Imported ${result.processedRows.toLocaleString()} transactions.`;
      showNotification({
        kind: "success",
        title: "Import completed",
        message: importedMessage,
      });
      onCompleted?.(result);
      resetTimer.current = window.setTimeout(() => {
        setIsOpen(false);
        resetForm();
        resetTimer.current = null;
      }, 10_000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
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

  const cancelUpload = () => {
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
  const progressStatus = isCompleted
    ? "success"
    : "active";

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
            <CloudUploadOutlined style={{ color: "#68b3e7", fontSize: 24 }} />
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Import transactions
              </Typography.Title>
              <Typography.Text type="secondary">
                Upload a CSV file and monitor the import in real time.
              </Typography.Text>
            </div>
          </Space>
        )}
        onCancel={closeModal}
        closable={!isUploading}
        mask={{ closable: !isUploading }}
        keyboard={!isUploading}
        footer={(
          <Flex justify="space-between" align="center" gap={12}>
            <Typography.Text type="secondary">
              {isUploading
                ? "Please keep this window open."
                : "CSV files only"}
            </Typography.Text>
            <Space>
              <Button onClick={closeModal} disabled={isUploading}>
                Close
              </Button>
              {isUploading ? (
                <Button danger icon={<StopOutlined />} onClick={cancelUpload}>
                  Cancel upload
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  onClick={() => void startUpload()}
                  disabled={!file}
                >
                  Start import
                </Button>
              )}
            </Space>
          </Flex>
        )}
      >
        <Space direction="vertical" size={18} style={{ width: "100%" }}>
          <Dragger
            key={filePickerKey}
            accept=".csv,text/csv"
            multiple={false}
            maxCount={1}
            disabled={isUploading}
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

          {file && (
            <Card size="small">
              <Flex align="center" gap={12}>
                <FileTextOutlined style={{ color: "#68b3e7", fontSize: 22 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Typography.Text strong ellipsis={{ tooltip: file.name }}>
                    {file.name}
                  </Typography.Text>
                  <br />
                  <Typography.Text type="secondary">
                    {formatFileSize(file.size)}
                  </Typography.Text>
                </div>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={removeFile}
                  disabled={isUploading}
                  aria-label="Remove selected file"
                />
              </Flex>
            </Card>
          )}

          {progress && (
            <Card size="small">
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Flex justify="space-between" align="center" gap={12}>
                  <Space size={8}>
                    {isProcessing && (
                      <Spin
                        size="small"
                        indicator={<LoadingOutlined spin />}
                      />
                    )}
                    <Typography.Text strong>
                      {isCompleted
                        ? "Import completed"
                        : isProcessing
                          ? "Importing rows"
                          : "Uploading file"}
                    </Typography.Text>
                  </Space>
                  <Typography.Text strong>
                    {isProcessing || isCompleted
                      ? `${progress.processedRows.toLocaleString()} rows`
                      : `${uploadPercent}%`}
                  </Typography.Text>
                </Flex>
                <Progress
                  percent={isProcessing || isCompleted ? 100 : uploadPercent}
                  status={progressStatus}
                  showInfo={false}
                />
                <Flex justify="space-between" align="center" gap={12}>
                  <Typography.Text type="secondary">
                    {isProcessing || isCompleted
                      ? `${progress.processedRows.toLocaleString()} rows processed`
                      : `${progress.completedParts} / ${progress.totalParts} parts uploaded`}
                  </Typography.Text>
                  <Tag color={isCompleted ? "success" : isProcessing ? "processing" : "blue"}>
                    {progress.status ?? "UPLOADING"}
                  </Tag>
                </Flex>
              </Space>
            </Card>
          )}
        </Space>
      </Modal>
    </>
  );
}
