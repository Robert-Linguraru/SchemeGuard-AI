import { request } from "../../../shared/api/httpClient";

export interface ConditionExplanation {
    explanation: string;
}

export interface TransactionExplanation {
    transactionId: string;
    qualificationStatus: string;
    qualificationCategory: string | null;
    selectedRuleId: string | null;
    ruleVersion: number | null;
    ruleCode: string | null;
    ruleName: string | null;
    originalExplanation: string | null;
    summary: string;
    passedConditions: ConditionExplanation[];
    failedConditions: ConditionExplanation[];
    evaluatedAt: string | null;
    interchangeRate: number | string | null;
    interchangeFee: number | string | null;
    schemeFee: number | string | null;
    acquirerFee: number | string | null;
    totalFee: number | string | null;
    optimizedFee: number | string | null;
    potentialSaving: number | string | null;
}

export const getTransactionExplanation = (
    transactionId: string,
    uploadId: string,
    signal?: AbortSignal
): Promise<TransactionExplanation> => request<TransactionExplanation>(
    `/api/results/explanation?transactionId=${encodeURIComponent(transactionId)}&uploadId=${encodeURIComponent(uploadId)}`,
    { method: "GET", signal }
);
