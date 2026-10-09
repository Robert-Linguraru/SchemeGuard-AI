import { useEffect, useState } from "react";
import { Button, Spin } from "antd";
import { ArrowRightOutlined, BarChartOutlined, FileTextOutlined, RobotOutlined, UploadOutlined } from "@ant-design/icons";
import { getUploads } from "../../uploads/api/uploadsApi";
import type { UploadSummary } from "../../uploads/types/upload";
import type { EntityListQuery } from "../../../shared/types/list";
import type { View } from "../../../shared/types/navigation";

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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        void getUploads({ page: 0, size: 5, search: "", sort: "uploadedAt,desc" } satisfies EntityListQuery, controller.signal)
            .then((result) => setUploads(result.items))
            .catch(() => { if (!controller.signal.aborted) setError(true); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, []);

    return (
        <main className="dashboard home-dashboard">
            <header className="home-welcome">
                <div>
                    <p className="home-eyebrow">SchemeGuard workspace</p>
                    <h1>Welcome back, {userName.split(" ")[0]}</h1>
                    <p>Your transaction operations, all in one place.</p>
                </div>
                <Button type="primary" size="large" icon={<UploadOutlined />} onClick={() => onNavigate("dashboard")}>
                    View CSV uploads
                </Button>
            </header>

            <section className="home-agent-card" aria-labelledby="home-agent-title">
                <div className="home-agent-icon"><RobotOutlined /></div>
                <div className="home-agent-copy">
                    <p className="home-eyebrow">Your transaction assistant</p>
                    <h2 id="home-agent-title">Meet ValiBOT</h2>
                    <p>The agent that can help you understand your transactions, investigate anomalies, and explore qualification outcomes.</p>
                    <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => onNavigate("my-agent")}>
                        Open ValiBOT
                    </Button>
                </div>
                <div className="home-agent-note"><span className="home-agent-dot" /> Ready to help with your data</div>
            </section>

            <div className="home-section-heading">
                <div><p className="home-eyebrow">Recent activity</p><h2>Latest CSV uploads</h2></div>
                <Button type="link" onClick={() => onNavigate("dashboard")}>All uploads <ArrowRightOutlined /></Button>
            </div>

            <section className="home-upload-card" aria-label="Latest CSV uploads">
                {loading ? <div className="home-loading"><Spin /> <span>Loading your uploads…</span></div> : error ? (
                    <div className="home-empty"><FileTextOutlined /><strong>Uploads aren’t available right now</strong><span>Try opening CSV uploads to refresh the list.</span><Button onClick={() => onNavigate("dashboard")}>Open CSV uploads</Button></div>
                ) : uploads.length === 0 ? (
                    <div className="home-empty"><FileTextOutlined /><strong>No CSVs uploaded yet</strong><span>Upload a transaction file to start reviewing your data.</span><Button type="primary" icon={<UploadOutlined />} onClick={() => onNavigate("dashboard")}>Go to CSV uploads</Button></div>
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

            <section className="home-shortcuts" aria-label="Workspace shortcuts">
                <button className="home-shortcut" onClick={() => onNavigate("analysis-dashboard")}><span><BarChartOutlined /></span><div><strong>Explore analytics</strong><small>Review transaction performance</small></div><ArrowRightOutlined /></button>
                <button className="home-shortcut" onClick={() => onNavigate("dashboard")}><span><UploadOutlined /></span><div><strong>Manage CSV files</strong><small>Upload and review transactions</small></div><ArrowRightOutlined /></button>
            </section>
        </main>
    );
}
