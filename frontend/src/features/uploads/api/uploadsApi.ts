import { request, requestBlob } from "../../../shared/api/httpClient";
import type {
    EntityListQuery,
    EntityListResponse
} from "../../../shared/types/list";
import type {
    UploadStatistics,
    UploadSummary,
    UploadTransactionPage
} from "../types/upload";

export interface EvaluationSummary {
    processed: number;
    qualified: number;
    fallback: number;
    wasEvaluated: boolean;
    message: string;
}

interface BackendPage<T> {
    content?: T[];
    items?: T[];
    page?: number;
    number?: number;
    size: number;
    totalElements: number;
    totalPages: number;
}

const buildPageUrl = (path: string, query: EntityListQuery) => {
    const params = new URLSearchParams({
        page: String(query.page),
        size: String(query.size)
    });

    if (query.search.trim()) {
        params.set("search", query.search.trim());
    }

    if (query.sort.trim()) {
        params.set("sort", query.sort);
    }

    return `${path}?${params.toString()}`;
};

const toEntityListResponse = <T>(response: BackendPage<T>): EntityListResponse<T> => ({
    items: response.items ?? response.content ?? [],
    page: response.page ?? response.number ?? 0,
    size: response.size,
    totalElements: response.totalElements,
    totalPages: response.totalPages
});

export const getUploads = (
    query: EntityListQuery,
    signal?: AbortSignal
): Promise<EntityListResponse<UploadSummary>> =>
    request<BackendPage<UploadSummary>>(buildPageUrl("/api/uploads", query), {
        method: "GET",
        signal
    }).then(toEntityListResponse);

export const getUploadTransactions = (
    uploadId: string,
    query: EntityListQuery,
    signal?: AbortSignal
): Promise<UploadTransactionPage> =>
    request<BackendPage<BackendTransaction>>(
        buildPageUrl(
            `/api/uploads/${encodeURIComponent(uploadId)}/transactions`,
            query
        ) + (query.anomaliesOnly ? "&anomaliesOnly=true" : ""),
        { method: "GET", signal }
    ).then((response) => {
        const page = toEntityListResponse(response);
        return {
            ...page,
            items: page.items.map(toTransaction)
        };
    });

interface BackendTransaction {
    id: string;
    uploadId: string | null;
    externalId: string;
    merchantName: string;
    schemeCode: string;
    schemeName: string;
    amount: number | string | null;
    currency: string;
    cardType: string | null;
    cardCategory: string | null;
    channel: string | null;
    issuerCountry: string | null;
    merchantCountry: string | null;
    transactionStatus: string | null;
    qualificationStatus: string | null;
    qualificationCategory: string | null;
    qualificationExplanation: string | null;
    evaluatedAt: string | null;
    authorizedAt: string | null;
    createdAt: string | null;
    estimatedFee: number | string | null;
}

const toTransaction = (transaction: BackendTransaction) => ({
    id: transaction.id,
    externalId: transaction.externalId,
    merchantName: transaction.merchantName,
    scheme: transaction.schemeCode || transaction.schemeName,
    amount: transaction.amount,
    currencyCode: transaction.currency,
    cardType: transaction.cardType,
    cardCategory: transaction.cardCategory,
    channel: transaction.channel,
    issuerCountry: transaction.issuerCountry,
    merchantCountry: transaction.merchantCountry,
    status: transaction.transactionStatus ?? "UNKNOWN",
    qualificationStatus: transaction.qualificationStatus ?? "NOT_EVALUATED",
    estimatedFee: transaction.estimatedFee,
    explanation: transaction.qualificationExplanation,
    authorizedAt: transaction.authorizedAt ?? transaction.createdAt
});

export const evaluateUpload = (uploadId: string): Promise<EvaluationSummary> =>
    request<EvaluationSummary>(
        `/api/uploads/${encodeURIComponent(uploadId)}/evaluate`,
        { method: "POST" }
    );

export const getUploadStatistics = (
    uploadId: string,
    signal?: AbortSignal
): Promise<UploadStatistics> =>
    request<UploadStatistics>(
        `/api/uploads/${encodeURIComponent(uploadId)}/statistics`,
        { method: "GET", signal }
    );

export const downloadUpload = (
    uploadId: string,
    signal?: AbortSignal,
    onResponse?: (response: Response) => void
): Promise<Blob> =>
    requestBlob(
        `/api/uploads/${encodeURIComponent(uploadId)}/download`,
        { method: "GET", signal },
        { onResponse }
    );

export interface AnomalyDetectionResponse {
    outlierTransactionIds: string[];
}

export const getUploadOutlierIds = (
    uploadId: string,
    signal?: AbortSignal
): Promise<string[]> =>
    request<string[]>(
        `/api/uploads/${encodeURIComponent(uploadId)}/anomalies`,
        { method: "GET", signal }
    );

export const detectUploadOutliers = (
    uploadId: string
): Promise<AnomalyDetectionResponse> =>
    request<AnomalyDetectionResponse>(
        `/api/uploads/${encodeURIComponent(uploadId)}/anomalies/detect`,
        { method: "POST" }
    );

export const confirmUploadOutlier = (
    uploadId: string,
    transactionId: string
): Promise<void> =>
    request<void>(
        `/api/uploads/${encodeURIComponent(uploadId)}/anomalies/${encodeURIComponent(transactionId)}/confirm`,
        { method: "POST" }
    );
