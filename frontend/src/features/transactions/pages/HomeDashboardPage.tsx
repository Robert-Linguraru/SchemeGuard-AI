import { useEffect, useMemo, useState } from "react";
import { Button, Spin } from "antd";
import {
    ArrowRightOutlined,
    CheckCircleOutlined,
    EuroOutlined,
    FileTextOutlined,
    InfoCircleOutlined,
    RobotOutlined,
    SendOutlined,
    UploadOutlined
} from "@ant-design/icons";
import { getUploads } from "../../uploads/api/uploadsApi";
import type { EntityListQuery } from "../../../shared/types/list";
import type { View } from "../../../shared/types/navigation";
import { getAnalytics, type AnalyticsResponse } from "../api/analyticsApi";
import { FloatingBackground } from "../../../shared/components/FloatingBackground";

const number = (value: number | string | undefined) => Number(value || 0);
const currency = (value: number | string | undefined, code = "EUR") => new Intl.NumberFormat(undefined, {
    style: "currency", currency: code, notation: "compact", maximumFractionDigits: 1
}).format(number(value));

const qualificationRows = [
    { key: "QUALIFIED", label: "Qualified", tone: "qualified" },
    { key: "PARTIALLY_QUALIFIED", label: "Partially qualified", tone: "partial" },
    { key: "NOT_QUALIFIED", label: "Not qualified", tone: "not-qualified" }
];

export function HomeDashboardPage({
    userName,
    onNavigate
}: {
    userName: string;
    onNavigate: (view: View) => void;
    onOpenUpload: (id: string, fileName: string, status: string, evaluated: boolean) => void;
}) {
    const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
    const [uploadTotal, setUploadTotal] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        const query = { page: 0, size: 1, search: "", sort: "uploadedAt,desc" } satisfies EntityListQuery;
        void Promise.all([
            getAnalytics({ from: "", to: "", scheme: "", country: "", merchant: "", qualification: "" }, controller.signal),
            getUploads(query, controller.signal)
        ]).then(([result, uploads]) => {
            setAnalytics(result);
            setUploadTotal(uploads.totalElements);
        }).catch(() => { /* Overview sections show graceful unavailable states. */ })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, []);

    const firstName = userName.trim().split(/\s+/)[0] || "there";
    const total = number(analytics?.totalTransactions);
    const processed = number(analytics?.processedTransactions);
    const rows = useMemo(() => qualificationRows.map((row) => {
        const match = analytics?.qualificationResults.find((item) => item.name.toUpperCase() === row.key);
        const count = number(match?.transactions);
        return { ...row, count, percent: processed ? Math.round((count / processed) * 100) : 0 };
    }), [analytics, processed]);
    const pending = Math.max(0, total - processed);

    return (
        <main className="dashboard home-dashboard">
            <FloatingBackground />
            <section className="home-hero" aria-labelledby="home-title">
                <div className="home-hero-copy">
                    <h1 id="home-title">Welcome back, {firstName}</h1>
                    <div className="home-hero-actions">
                        <Button type="primary" icon={<UploadOutlined />} onClick={() => onNavigate("dashboard")}>Upload transactions</Button>
                    </div>
                </div>
            </section>

            <section className="home-overview" aria-label="Workspace at a glance" aria-busy={loading}>
                <div className="home-overview-heading"><h2>Workspace overview</h2></div>
                <div className="home-stat-grid">
                    <article className="home-stat-card"><span className="home-stat-icon"><FileTextOutlined /></span><div><small>Transactions</small><strong>{loading ? <Spin size="small" /> : analytics ? total.toLocaleString() : "—"}</strong></div></article>
                    <article className="home-stat-card"><span className="home-stat-icon home-stat-icon-green"><CheckCircleOutlined /></span><div><small>Qualification rate</small><strong>{loading ? <Spin size="small" /> : analytics ? `${number(analytics.qualificationRate).toFixed(1)}%` : "—"}</strong></div></article>
                    <article className="home-stat-card"><span className="home-stat-icon home-stat-icon-coral"><EuroOutlined /></span><div><small>Interchange fees</small><strong>{loading ? <Spin size="small" /> : analytics ? currency(analytics.totalFees, analytics.currency) : "—"}</strong></div></article>
                    <article className="home-stat-card"><span className="home-stat-icon home-stat-icon-blue"><UploadOutlined /></span><div><small>Imported files</small><strong>{loading ? <Spin size="small" /> : uploadTotal === null ? "—" : uploadTotal.toLocaleString()}</strong></div></article>
                    <article className="home-stat-card"><span className="home-stat-icon home-stat-icon-coral"><EuroOutlined /></span><div><small>Potential fees saved</small><strong>{loading ? <Spin size="small" /> : analytics ? currency(analytics.potentialFeesSaved, analytics.currency) : "—"}</strong></div></article>
                </div>
            </section>

            <section className="home-valibot-card" aria-labelledby="home-valibot-title">
                <div className="home-valibot-copy">
                    <p className="home-eyebrow">SchemeGuard assistant</p>
                    <h2 id="home-valibot-title">Meet ValiBOT, your online transaction helper</h2>
                    <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => onNavigate("my-agent")}>Chat with ValiBOT</Button>
                </div>
                <div className="home-valibot-visual" aria-hidden="true">
                    <div className="home-valibot-glow" />
                    <div className="home-chat-window">
                        <div className="home-chat-top"><span><RobotOutlined /> ValiBOT</span><small><i /> Online</small></div>
                        <div className="home-chat-bubble home-chat-user">Why was this transaction declined?</div>
                        <div className="home-chat-bubble home-chat-agent"><span><RobotOutlined /></span><div>Checking scheme rules<i><b /><b /><b /></i></div></div>
                        <div className="home-chat-input"><span>Ask about your transactions</span><i><SendOutlined /></i></div>
                    </div>
                    <span className="home-chat-spark home-chat-spark-one">✦</span>
                    <span className="home-chat-spark home-chat-spark-two">✧</span>
                </div>
            </section>

            <div className="home-insight-grid">
                <section className="home-panel home-qualification-panel" aria-labelledby="home-qualification-title">
                    <div className="home-section-heading"><h2 id="home-qualification-title">Qualification mix</h2><Button type="link" onClick={() => onNavigate("analysis-dashboard")}>Open analytics <ArrowRightOutlined /></Button></div>
                    {loading ? <div className="home-data-placeholder"><Spin /> <span>Preparing your overview…</span></div> : analytics ? <>
                        <div className="home-qualification-bars" role="list" aria-label="Transactions by qualification outcome">
                            {rows.map((row) => <div className="home-qualification-row" role="listitem" key={row.key}>
                                <div className="home-qualification-label"><span className={`home-qualification-dot ${row.tone}`} /><span>{row.label}</span><strong>{row.count.toLocaleString()}</strong></div>
                                <div className="home-bar-track"><span className={row.tone} style={{ width: `${row.percent}%` }} /></div>
                            </div>)}
                        </div>
                        <p className="home-insight-note"><InfoCircleOutlined /> {pending ? `${pending.toLocaleString()} transactions have not been processed yet.` : "All transactions in this workspace have been processed."}</p>
                    </> : <div className="home-data-placeholder"><InfoCircleOutlined /><span>Portfolio metrics are unavailable right now.</span><Button onClick={() => onNavigate("analysis-dashboard")}>Open analytics</Button></div>}
                </section>

                <aside className="home-app-flow" aria-label="How to use SchemeGuard">
                    <h2>How it works</h2>
                    <button onClick={() => onNavigate("dashboard")}><span>1</span><div><strong>Upload transactions</strong><small>Import a transaction file</small></div><ArrowRightOutlined /></button>
                    <button onClick={() => onNavigate("analysis-dashboard")}><span>2</span><div><strong>Review the results</strong><small>Check qualification and fees</small></div><ArrowRightOutlined /></button>
                    <button onClick={() => onNavigate("my-agent")}><span>3</span><div><strong>Investigate with ValiBOT</strong><small>Ask about exceptions</small></div><ArrowRightOutlined /></button>
                </aside>
            </div>
        </main>
    );
}
