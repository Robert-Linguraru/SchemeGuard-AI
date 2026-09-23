import type { UploadStatistics } from "../../uploads/types/upload";

interface TransactionStatsProps {
    statistics: UploadStatistics | null;
    isLoading: boolean;
    error: string | null;
}

export function TransactionStats({ statistics, isLoading, error }: TransactionStatsProps) {
    if (isLoading) {
        return <section className="stats-grid"><div className="empty-state">Loading statistics...</div></section>;
    }

    if (error) {
        return <section className="stats-grid"><div className="error-box" role="alert">{error}</div></section>;
    }

    if (!statistics) {
        return null;
    }

    const hasProcessedTransactions = statistics.processedTransactions > 0;
    const stats = [
        ["Total transactions", statistics.totalTransactions, "Complete CSV total"],
        ["Processed", statistics.processedTransactions, "Complete CSV total"],
        ["Qualified", hasProcessedTransactions ? statistics.qualifiedTransactions : "—", "Complete CSV total"],
        ["Estimated fees", hasProcessedTransactions ? `${statistics.totalFees.toFixed(2)} EUR` : "—", "Complete CSV total"]
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