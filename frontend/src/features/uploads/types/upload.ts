import type { EntityListResponse } from "../../../shared/types/list";
import type { Transaction } from "../../../shared/types/transaction";

export type UploadImportStatus =
    | "UPLOADING"
    | "QUEUED"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | (string & {});

export type UploadEvaluationStatus =
    | "NOT_EVALUATED"
    | "EVALUATED"
    | "QUEUED"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED"
    | (string & {});

export interface UploadSummary {
    id: string;
    fileName: string;
    uploadedAt: string;
    importStatus: UploadImportStatus;
    wasEvaluated: boolean;
    evaluationStatus: UploadEvaluationStatus;
    transactionCount: number;
}

export interface UploadTransactionPage extends EntityListResponse<Transaction> {}

export interface UploadStatistics {
    totalTransactions: number;
    processedTransactions: number;
    pendingTransactions: number;
    qualifiedTransactions: number;
    partiallyQualifiedTransactions: number;
    notQualifiedTransactions: number;
    totalAmount: number;
    totalFees: number;
    qualificationRate: number;
}
