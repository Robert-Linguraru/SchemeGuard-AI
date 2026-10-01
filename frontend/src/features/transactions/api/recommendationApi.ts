import { request } from "../../../shared/api/httpClient";

export interface RecommendationResponse {
    transactionId: string;
    externalId: string;
    qualificationStatus: string;
    message: string;
}

export const askRecommendationAgent = (
    uploadId: string,
    transactionId: string,
    message: string,
    signal?: AbortSignal
): Promise<RecommendationResponse> => request<RecommendationResponse>(
    "/api/assistant/recommendations",
    {
        method: "POST",
        signal,
        body: JSON.stringify({ uploadId, transactionId, message })
    }
);
