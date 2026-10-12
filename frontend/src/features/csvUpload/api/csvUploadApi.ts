import type {
  CreateUploadResponse,
  UploadProgress,
  UploadStatusResponse,
  TransactionSource,
} from "../../../types/csvUploadType";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const MAX_RETRIES = 3;
const IMPORT_STATUS_POLL_INTERVAL_MS = 2_000;

export class UploadImportError extends Error {
  constructor(message: string, public readonly processedRows: number) {
    super(message);
    this.name = "UploadImportError";
  }
}

export class DuplicateUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateUploadError";
  }
}

export class UploadCleanupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadCleanupError";
  }
}

function authorizationHeaders(): Record<string, string> {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { message?: string };
    return new Error(
      body.message ?? `Request failed with HTTP ${response.status}`,
    );
  } catch {
    return new Error(`Request failed with HTTP ${response.status}`);
  }
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Upload cancelled", "AbortError"));
      },
      { once: true },
    );
  });
}

async function uploadPartWithRetry(
  uploadId: string,
  partNumber: number,
  buffer: ArrayBuffer,
  checksum: string,
  signal: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    signal.throwIfAborted();
    const response = await fetch(
      `${API_BASE_URL}/uploads/${uploadId}/parts/${partNumber}`,
      {
        method: "PUT",
        headers: {
          ...authorizationHeaders(),
          "Content-Type": "application/octet-stream",
          "X-Chunk-SHA256": checksum,
        },
        body: buffer,
        signal,
      },
    );

    if (response.ok) {
      return;
    }

    if (response.status !== 429 && response.status < 500) {
      throw await parseError(response);
    }

    if (attempt === MAX_RETRIES - 1) {
      throw await parseError(response);
    }

    const retryAfterSeconds = Number(response.headers.get("Retry-After"));
    const backoffMilliseconds = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1_000
      : 500 * 2 ** attempt;
    await sleep(backoffMilliseconds, signal);
  }
}

async function createUpload(
  file: File,
  sourceName: string,
): Promise<CreateUploadResponse> {
  const response = await fetch(`${API_BASE_URL}/uploads`, {
    method: "POST",
    headers: {
      ...authorizationHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      fileSizeBytes: file.size,
      sourceName,
    }),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as CreateUploadResponse;
}

async function getStatus(
  uploadId: string,
  signal?: AbortSignal,
): Promise<UploadStatusResponse> {
  const response = await fetch(
    `${API_BASE_URL}/uploads/${uploadId}?_=${Date.now()}`,
    {
      cache: "no-store",
      headers: {
        ...authorizationHeaders(),
        "Cache-Control": "no-cache",
      },
      signal,
    },
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as UploadStatusResponse;
}

export async function uploadCsv(
  file: File,
  sourceName: string,
  onProgress: (progress: UploadProgress) => void,
  signal: AbortSignal,
): Promise<UploadStatusResponse> {
  let session: CreateUploadResponse | null = null;
  try {
    // Keep creation alive until the server returns its ID. If the user cancels
    // while this request is in flight, we need that ID to clean up the session.
    const createdSession = await createUpload(file, sourceName);
    session = createdSession;
    signal.throwIfAborted();

    let nextPart = 0;
    let completedParts = 0;
    const concurrency = Math.min(
      createdSession.maxParallelUploads,
      createdSession.totalParts,
    );

    const worker = async (): Promise<void> => {
      while (true) {
        signal.throwIfAborted();
        const partNumber = nextPart;
        nextPart += 1;
        if (partNumber >= createdSession.totalParts) {
          return;
        }

        const start = partNumber * createdSession.chunkSizeBytes;
        const end = Math.min(start + createdSession.chunkSizeBytes, file.size);
        const buffer = await file.slice(start, end).arrayBuffer();
        const checksum = await sha256Hex(buffer);
        await uploadPartWithRetry(
          createdSession.uploadId,
          partNumber,
          buffer,
          checksum,
          signal,
        );
        completedParts += 1;
        onProgress({
          phase: "uploading",
          completedParts,
          totalParts: createdSession.totalParts,
          processedRows: 0,
          status: "UPLOADING",
        });
      }
    };

    onProgress({
      phase: "uploading",
      completedParts: 0,
      totalParts: createdSession.totalParts,
      processedRows: 0,
      status: "UPLOADING",
    });
    await Promise.all(
      Array.from({ length: concurrency }, () => worker()),
    );

    const completeResponse = await fetch(
      `${API_BASE_URL}/uploads/${createdSession.uploadId}/complete`,
      {
        method: "POST",
        headers: authorizationHeaders(),
        signal,
      },
    );
    if (!completeResponse.ok) {
      throw await parseError(completeResponse);
    }

    let status = await getStatus(createdSession.uploadId, signal);
    while (status.status === "QUEUED"
      || status.status === "PROCESSING"
      || status.status === "FINALIZING") {
      onProgress({
        phase: status.status === "FINALIZING" ? "finalizing" : "processing",
        completedParts: createdSession.totalParts,
        totalParts: createdSession.totalParts,
        processedRows: status.processedRows,
        status: status.status,
      });
      await sleep(IMPORT_STATUS_POLL_INTERVAL_MS, signal);
      status = await getStatus(createdSession.uploadId, signal);
    }

    if (status.status === "DUPLICATE") {
      throw new DuplicateUploadError(
        status.errorMessage ?? "This file has already been imported by your account.",
      );
    }

    if (status.status === "DUPLICATES_FOUND") {
      return status;
    }

    if (status.status !== "COMPLETED") {
      throw new UploadImportError(
        status.errorMessage ?? "The CSV import failed.",
        status.processedRows,
      );
    }

    onProgress({
      phase: "completed",
      completedParts: createdSession.totalParts,
      totalParts: createdSession.totalParts,
      processedRows: status.processedRows,
      status: status.status,
    });
    return status;
  } catch (error) {
    // Import errors already have a terminal backend status; cancel only an
    // upload that failed before it reached a terminal import result.
    if (session
      && !(error instanceof UploadImportError)
      && !(error instanceof DuplicateUploadError)) {
      try {
        await cancelUpload(session.uploadId);
      } catch (cleanupError) {
        // Cancellation can race the final commit. Reconcile the server state
        // before reporting a cleanup failure or telling the user it was cancelled.
        let currentStatus: UploadStatusResponse | null = null;
        try {
          currentStatus = await getStatus(session.uploadId);
        } catch {
          // Keep the original cleanup error below when the status is unavailable.
        }

        if (currentStatus?.status === "COMPLETED"
          || currentStatus?.status === "DUPLICATES_FOUND") {
          return currentStatus;
        }
        if (currentStatus?.status === "DUPLICATE") {
          throw new DuplicateUploadError(
            currentStatus.errorMessage
              ?? "This file has already been imported by your account.",
          );
        }
        if (currentStatus?.status === "FAILED") {
          throw new UploadImportError(
            currentStatus.errorMessage ?? "The CSV import failed.",
            currentStatus.processedRows,
          );
        }
        if (currentStatus?.status !== "CANCELLED") {
          const details = cleanupError instanceof Error
            ? cleanupError.message
            : "The server did not confirm cleanup.";
          throw new UploadCleanupError(
            `Could not confirm upload cleanup. ${details}`,
          );
        }
      }
    }
    throw error;
  }
}

export async function getTransactionSources(
  signal?: AbortSignal,
): Promise<TransactionSource[]> {
  const response = await fetch(`${API_BASE_URL}/transaction-sources`, {
    headers: authorizationHeaders(),
    signal,
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as TransactionSource[];
}

export async function confirmDuplicateImport(
  uploadId: string,
): Promise<UploadStatusResponse> {
  const response = await fetch(
    `${API_BASE_URL}/uploads/${uploadId}/duplicates/confirm`,
    {
      method: "POST",
      headers: authorizationHeaders(),
    },
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as UploadStatusResponse;
}

export async function downloadDuplicateReport(uploadId: string): Promise<Blob> {
  const response = await fetch(
    `${API_BASE_URL}/uploads/${uploadId}/duplicates.xlsx`,
    { headers: authorizationHeaders() },
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  return response.blob();
}

export async function downloadOriginalCsv(uploadRecordId: string): Promise<Blob> {
  const response = await fetch(
    `${API_BASE_URL}/uploads/${encodeURIComponent(uploadRecordId)}/download`,
    { headers: authorizationHeaders() },
  );
  if (!response.ok) {
    throw await parseError(response);
  }
  return response.blob();
}

export async function cancelUpload(uploadId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/uploads/${uploadId}`, {
    method: "DELETE",
    headers: authorizationHeaders(),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
