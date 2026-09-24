import { useEffect, useState } from "react";
import type { Transaction } from "../../../shared/types/transaction";
import { convertFeeToEur } from "../api/currencyApi";
import { sumPageFeesInEur } from "../utils/pageFees";

interface TransactionStatsProps {
    transactions: Transaction[];
    totalTransactions: number;
}

export function TransactionStats({ transactions, totalTransactions }: TransactionStatsProps) {
    const [feeResult, setFeeResult] = useState<{
        transactions: Transaction[];
        total?: number;
        error?: string;
    } | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        void sumPageFeesInEur(transactions, convertFeeToEur, controller.signal)
            .then((total) => {
                if (!controller.signal.aborted) setFeeResult({ transactions, total });
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    setFeeResult({ transactions, error: error instanceof Error
                        ? error.message : "Currency conversion failed." });
                    controller.abort();
                }
            });
        return () => controller.abort();
    }, [transactions]);

    const currentFees = feeResult?.transactions === transactions ? feeResult : null;
    const processed = transactions.filter((transaction) => transaction.status === "PROCESSED").length;
    const qualified = transactions.filter((transaction) => transaction.qualificationStatus === "QUALIFIED").length;
    const stats = [
        ["Total transactions", totalTransactions, "Complete CSV total"],
        ["Processed", processed, "On this page"],
        ["Qualified", qualified, "On this page"],
        ["Estimated fees", currentFees?.error ? "Unavailable"
            : currentFees?.total !== undefined ? `${currentFees.total.toFixed(2)} EUR` : "Converting...",
            currentFees?.error ? `Could not convert fees to EUR: ${currentFees.error}` : "On this page · Converted to EUR"]
    ];

    return (
        <section className="stats-grid">
            {stats.map(([label, value, description]) => (
                <article className="stat-card" key={label}>
                    <span className="stat-label">{label}</span>
                    <strong>{value}</strong>
                    <span className="stat-description">{description}</span>
                </article>
            ))}
        </section>
    );
}
