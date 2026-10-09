import { useEffect, useState } from "react";
import { Button, Spin } from "antd";
import { ArrowRightOutlined, BarChartOutlined, CheckCircleOutlined, ClockCircleOutlined, CreditCardOutlined, EuroOutlined, FileTextOutlined, RobotOutlined, UploadOutlined } from "@ant-design/icons";
import { getUploads } from "../../uploads/api/uploadsApi";
import type { UploadSummary } from "../../uploads/types/upload";
import type { EntityListQuery } from "../../../shared/types/list";
import type { View } from "../../../shared/types/navigation";
import { getAnalytics, type AnalyticsResponse } from "../api/analyticsApi";

const uploadStatus = (status: string) => status.toUpperCase() === "COMPLETED"
    ? "Ready"
    : status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export function HomeDashboardPage({
    userName,
    onNavigate,
    onOpenUpload
}: {
    userName: string;
    onNavigate: (view: View) => void;
    onOpenUpload: (id: string, fileName: string, status: string, evaluated: boolean) => void;
}) {
    const [uploads, setUploads] = useState<UploadSummary[]>([]);
    const [uploadTotal, setUploadTotal] = useState(0);
    const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [analyticsLoading, setAnalyticsLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        void getUploads({ page: 0, size: 5, search: "", sort: "uploadedAt,desc" } satisfies EntityListQuery, controller.signal)
            .then((result) => {
                setUploads(result.items);
                setUploadTotal(result.totalElements);
            })
            .catch(() => { if (!controller.signal.aborted) setError(true); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        void getAnalytics({ from: "", to: "", scheme: "", country: "", merchant: "", qualification: "" }, controller.signal)
            .then((result) => setAnalytics(result))
            .catch(() => { /* Keep the dashboard useful when analytics are temporarily unavailable. */ })
            .finally(() => { if (!controller.signal.aborted) setAnalyticsLoading(false); });
        return () => controller.abort();
    }, []);

    const firstName = userName.trim().split(/\s+/)[0] || "there";
    const stats = [
        { label: "Transactions", value: analytics?.totalTransactions, icon: <FileTextOutlined />, detail: "Across your workspace", tone: "blue" },
        { label: "Qualification rate", value: analytics ? `${Number(analytics.qualificationRate).toFixed(1)}%` : undefined, icon: <CheckCircleOutlined />, detail: analytics ? `${analytics.qualifiedTransactions.toLocaleString()} qualified` : "Current portfolio", tone: "green" },
        { label: "Fees reviewed", value: analytics ? new Intl.NumberFormat(undefined, { style: "currency", currency: analytics.currency || "EUR", notation: "compact", maximumFractionDigits: 1 }).format(Number(analytics.totalFees)) : undefined, icon: <EuroOutlined />, detail: "Interchange fees", tone: "coral" },
        { label: "Pending review", value: analytics ? Math.max(0, analytics.totalTransactions - analytics.processedTransactions) : undefined, icon: <ClockCircleOutlined />, detail: "Transactions to assess", tone: "amber" }
    ];

    return (
        <main className="dashboard home-dashboard">
            <header className="home-welcome">
                <div>
                    <p className="home-eyebrow">Workspace overview</p>
                    <h1>Welcome back, {firstName}</h1>
                </div>
                <Button type="primary" size="large" icon={<UploadOutlined />} onClick={() => onNavigate("dashboard")}>
                    Upload transactions
                </Button>
            </header>

            <section className="home-stat-grid" aria-label="Workspace statistics" aria-busy={analyticsLoading}>
                {stats.map((stat, index) => (
                    <article className={`home-stat-card home-stat-${stat.tone}`} key={stat.label} style={{ animationDelay: `${index * 65}ms` }}>
                        <div className="home-stat-top"><span>{stat.label}</span><i aria-hidden="true">{stat.icon}</i></div>
                        <strong>{analyticsLoading ? <Spin size="small" /> : stat.value === undefined ? "—" : typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}</strong>
                        <small>{stat.detail}</small>
                    </article>
                ))}
            </section>

            <div className="home-dashboard-grid">
                <section className="home-panel home-recent-panel" aria-label="Latest CSV uploads">
                    <div className="home-section-heading">
                        <div><p className="home-eyebrow">Recent activity</p><h2>Latest uploads <span>{uploadTotal}</span></h2></div>
                        <Button type="link" onClick={() => onNavigate("dashboard")}>View all <ArrowRightOutlined /></Button>
                    </div>
                    {loading ? <div className="home-loading"><Spin /> <span>Loading uploads…</span></div> : error ? (
                        <div className="home-empty"><FileTextOutlined /><strong>Uploads are unavailable</strong><Button onClick={() => onNavigate("dashboard")}>Open uploads</Button></div>
                    ) : uploads.length === 0 ? (
                        <div className="home-empty"><FileTextOutlined /><strong>No uploads yet</strong><span>Import a transaction file to get started.</span><Button type="primary" icon={<UploadOutlined />} onClick={() => onNavigate("dashboard")}>Upload a file</Button></div>
                    ) : (
                        <div className="home-upload-list">
                            {uploads.map((upload) => (
                                <button className="home-upload-row" key={upload.id} onClick={() => onOpenUpload(upload.id, upload.fileName, upload.importStatus, upload.wasEvaluated)}>
                                    <span className="home-file-icon"><FileTextOutlined /></span>
                                    <span className="home-upload-name"><strong title={upload.fileName}>{upload.fileName}</strong><small>{new Date(upload.uploadedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}{upload.sourceName ? ` · ${upload.sourceName}` : ""}</small></span>
                                    <span className={`home-upload-status ${upload.importStatus === "COMPLETED" ? "is-ready" : ""}`}>{uploadStatus(upload.importStatus)}</span>
                                    <span className="home-upload-count">{upload.transactionCount.toLocaleString()} <small>transactions</small></span>
                                    <ArrowRightOutlined className="home-upload-arrow" />
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                <aside className="home-tools-column" aria-label="Workspace tools">
                    <section className="home-agent-card" aria-labelledby="home-agent-title">
                        <div className="home-agent-card-top"><span className="home-agent-icon"><RobotOutlined /></span><span className="home-agent-note"><i /> Ready</span></div>
                        <p className="home-eyebrow">AI transaction assistant</p>
                        <h2 id="home-agent-title">ValiBOT</h2>
                        <p>Investigate exceptions and understand qualification outcomes.</p>
                        <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => onNavigate("my-agent")}>Open assistant</Button>
                    </section>
                    <section className="home-quick-actions" aria-label="Quick actions">
                        <h2>Explore</h2>
                        <button className="home-shortcut" onClick={() => onNavigate("analysis-dashboard")}><span><BarChartOutlined /></span><div><strong>Analytics</strong><small>Performance and fees</small></div><ArrowRightOutlined /></button>
                        <button className="home-shortcut" onClick={() => onNavigate("dashboard")}><span><UploadOutlined /></span><div><strong>CSV uploads</strong><small>Manage transaction files</small></div><ArrowRightOutlined /></button>
                        <button className="home-shortcut" onClick={() => onNavigate("card-schemes")}><span><CreditCardOutlined /></span><div><strong>Card schemes</strong><small>Browse scheme rules</small></div><ArrowRightOutlined /></button>
                    </section>
                </aside>
            </div>
        </main>
    );
}
