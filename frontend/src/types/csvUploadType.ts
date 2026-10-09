export type UploadStatus =
  | "UPLOADING"
  | "QUEUED"
  | "PROCESSING"
  | "DUPLICATES_FOUND"
  | "COMPLETED"
  | "DUPLICATE"
  | "FAILED"
  | "CANCELLED";

export type CreateUploadResponse = {
  uploadId: string;
  uploadRecordId: string;
  chunkSizeBytes: number;
  totalParts: number;
  maxParallelUploads: number;
};

export type TransactionSource = {
  id: string;
  name: string;
};

export type UploadStatusResponse = {
  uploadId: string;
  uploadRecordId: string | null;
  fileName: string;
  status: UploadStatus;
  expectedFileSizeBytes: number;
  uploadedBytes: number;
  uploadedParts: number;
  expectedTotalParts: number;
  processedRows: number;
  duplicateRows: number;
  errorMessage: string | null;
  uploadedAt: string;
};

export type UploadProgress = {
  phase: "uploading" | "processing" | "completed";
  completedParts: number;
  totalParts: number;
  processedRows: number;
  status: UploadStatus | null;
};
