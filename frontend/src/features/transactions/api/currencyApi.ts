import { request } from "../../../shared/api/httpClient";

export async function convertFeeToEur(
    sourceCurrency: string,
    sourceValue: string,
    signal: AbortSignal
): Promise<number> {
    const params = new URLSearchParams({ sourceCurrency, targetCurrency: "EUR", sourceValue });
    const result = await request<{ targetValue: number }>(`/api/currency/convert?${params}`, { signal });
    return result.targetValue;
}
