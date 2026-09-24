import type { UploadStatistics } from "../../uploads/types/upload";

interface TransactionStatsProps {
    statistics: UploadStatistics;
}

export function TransactionStats({ statistics }: TransactionStatsProps) {
    const stats = [
        ["Total transactions", statistics.totalTransactions, "Complete CSV total"],
        ["Processed", statistics.processedTransactions, "Complete CSV total"],
        ["Qualified", statistics.qualifiedTransactions, "Complete CSV total"],
        ["Estimated fees", `${statistics.totalFees.toFixed(2)} EUR`, "Complete CSV total - Converted to EUR"]
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
