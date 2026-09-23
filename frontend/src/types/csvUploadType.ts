export type UploadStatus =
  | "UPLOADING"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type CreateUploadResponse = {
  uploadId: string;
  uploadRecordId: string;
  chunkSizeBytes: number;
  totalParts: number;
  maxParallelUploads: number;
};

export type UploadStatusResponse = {
  uploadId: string;
  uploadRecordId: string;
  fileName: string;
  status: UploadStatus;
  expectedFileSizeBytes: number;
  uploadedBytes: number;
  uploadedParts: number;
  expectedTotalParts: number;
  processedRows: number;
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
