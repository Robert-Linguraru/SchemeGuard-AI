import type { Transaction } from "../../../shared/types/transaction";

type ConvertFee = (currency: string, value: string, signal: AbortSignal) => Promise<number>;

export async function sumPageFeesInEur(
    transactions: Pick<Transaction, "estimatedFee" | "currencyCode">[],
    convert: ConvertFee,
    signal: AbortSignal
): Promise<number> {
    let nextIndex = 0;
    let totalCents = 0;
    const conversions = new Map<string, Promise<number>>();

    const worker = async () => {
        while (nextIndex < transactions.length) {
            signal.throwIfAborted();
            const transaction = transactions[nextIndex++];
            const value = String(transaction.estimatedFee ?? 0);
            if (!Number.isFinite(Number(value)) || Number(value) < 0) {
                throw new Error("A transaction has an invalid estimated fee.");
            }
            if (Number(value) === 0) continue;

            const currency = transaction.currencyCode.trim().toUpperCase();
            const key = `${currency}:${value}`;
            let conversion = conversions.get(key);
            if (!conversion) {
                conversion = convert(currency, value, signal);
                conversions.set(key, conversion);
            }
            // The API rounds each converted fee to EUR cents before summation.
            const converted = await conversion;
            signal.throwIfAborted();
            const cents = Math.round(converted * 100);
            if (!Number.isFinite(converted) || converted < 0 || !Number.isSafeInteger(cents)
                || !Number.isSafeInteger(totalCents + cents)) {
                throw new Error("The converted fee total is invalid or too large.");
            }
            totalCents += cents;
        }
    };

    // Bound requests even when the table displays 100 transactions.
    await Promise.all(Array.from({ length: Math.min(6, transactions.length) }, worker));
    return totalCents / 100;
}
