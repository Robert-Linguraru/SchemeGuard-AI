import type { Transaction } from "../../../shared/types/transaction";

interface TransactionStatsProps {
    transactions: Transaction[];
    totalTransactions: number;
}

export function TransactionStats({ transactions, totalTransactions }: TransactionStatsProps) {
    const processed = transactions.filter((transaction) => transaction.status === "PROCESSED").length;
    const qualified = transactions.filter((transaction) => transaction.qualificationStatus === "QUALIFIED").length;
    const totalFees = transactions.reduce((total, transaction) => total + Number(transaction.estimatedFee || 0), 0);
    const stats = [
        ["Total transactions", totalTransactions, "Complete CSV total"],
        ["Processed", processed, "On this page"],
        ["Qualified", qualified, "On this page"],
        ["Estimated fees", `${totalFees.toFixed(2)} EUR`, "On this page"]
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