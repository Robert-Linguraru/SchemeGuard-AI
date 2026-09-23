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
    | "NOT_STARTED"
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
    evaluationStatus: UploadEvaluationStatus;
    transactionCount: number;
}

export interface UploadTransactionPage extends EntityListResponse<Transaction> {}

export interface UploadStatistics {
    totalTransactions: number;
    evaluatedTransactions: number;
    qualifiedTransactions: number;
    partiallyQualifiedTransactions: number;
    notQualifiedTransactions: number;
    totalAmount: number | string;
    totalFees: number | string;
    averageTransactionAmount: number | string;
    qualificationRate: number | string;
}