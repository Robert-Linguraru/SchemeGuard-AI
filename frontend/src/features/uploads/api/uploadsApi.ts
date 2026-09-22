import { request } from "../../../shared/api/httpClient";
import type {
    EntityListQuery,
    EntityListResponse
} from "../../../shared/types/list";
import type {
    UploadStatistics,
    UploadSummary,
    UploadTransactionPage
} from "../types/upload";

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
    page = 0,
    size = 50,
    signal?: AbortSignal
): Promise<UploadTransactionPage> =>
    request<BackendPage<UploadTransactionPage["items"][number]>>(
        `/api/uploads/${encodeURIComponent(uploadId)}/transactions?page=${page}&size=${size}`,
        { method: "GET", signal }
    ).then(toEntityListResponse);

export const evaluateUpload = (uploadId: string): Promise<void> =>
    request<void>(
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
    signal?: AbortSignal
): Promise<Blob> =>
    request<Blob>(
        `/api/uploads/${encodeURIComponent(uploadId)}/download`,
        { method: "GET", signal }
    );