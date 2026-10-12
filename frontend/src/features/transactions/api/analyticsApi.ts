import { request } from "../../../shared/api/httpClient";

export const ANALYTICS_CURRENCY = "EUR";

export interface AnalyticsMetric {
    name: string;
    transactions: number;
    fees: number | string;
}

export interface AnalyticsResponse {
    currency: string;
    totalTransactions: number;
    processedTransactions: number;
    qualifiedTransactions: number;
    partiallyQualifiedTransactions: number;
    notQualifiedTransactions: number;
    totalAmount: number | string;
    totalFees: number | string;
    potentialFeesSaved: number | string;
    averageTransactionAmount: number | string;
    qualificationRate: number | string;
    qualificationResults: AnalyticsMetric[];
    feesByScheme: AnalyticsMetric[];
    transactionsByCountry: AnalyticsMetric[];
    topMerchantsByFees: AnalyticsMetric[];
}

export interface AnalyticsFilters {
    from: string;
    to: string;
    scheme: string;
    country: string;
    merchant: string;
    qualification: string;
    targetCurrency: string;
}

export function getAvailableCurrencies(signal?: AbortSignal): Promise<string[]> {
    return request<string[]>("/api/currency/available", {
        method: "GET",
        signal
    });
}

export function getAnalytics(filters: AnalyticsFilters, signal?: AbortSignal): Promise<AnalyticsResponse> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });
    params.set("targetCurrency", filters.targetCurrency || ANALYTICS_CURRENCY);
    const query = params.toString();
    return request<AnalyticsResponse>(`/api/analytics${query ? `?${query}` : ""}`, {
        method: "GET",
        signal
    });
}
