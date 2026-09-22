import { request } from "../../../shared/api/httpClient";
import type { Transaction } from "../../../shared/types/transaction";

interface TransactionResponse {
    id: string;
    externalId: string;
    merchantName: string;
    schemeCode: string;
    amount: number | string | null;
    currency: string;
    cardType: string | null;
    cardCategory: string | null;
    channel: string | null;
    issuerCountry: string | null;
    merchantCountry: string | null;
    transactionStatus: string | null;
    qualificationStatus: string | null;
    qualificationExplanation: string | null;
    evaluatedAt: string | null;
    createdAt: string | null;
    estimatedFee: number | string | null;
}

interface TransactionPageResponse {
    content: TransactionResponse[];
}

export const getTransactions = (signal?: AbortSignal): Promise<Transaction[]> =>
    request<TransactionPageResponse>("/api/transactions?page=0&size=50", {
        method: "GET",
        signal
    }).then((page) => page.content.map((transaction): Transaction => ({
        id: transaction.id,
        externalId: transaction.externalId,
        merchantName: transaction.merchantName,
        scheme: transaction.schemeCode,
        amount: transaction.amount,
        currencyCode: transaction.currency,
        cardType: transaction.cardType,
        cardCategory: transaction.cardCategory,
        channel: transaction.channel,
        issuerCountry: transaction.issuerCountry,
        merchantCountry: transaction.merchantCountry,
        status: transaction.transactionStatus ?? "UNKNOWN",
        qualificationStatus: transaction.qualificationStatus ?? "PENDING",
        estimatedFee: transaction.estimatedFee,
        explanation: transaction.qualificationExplanation,
        authorizedAt: transaction.createdAt
    })));
