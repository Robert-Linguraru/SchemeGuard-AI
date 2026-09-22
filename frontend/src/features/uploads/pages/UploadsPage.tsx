import { useCallback, useState } from "react";
import { useAuth } from "../../../app/AuthProvider";
import CsvTransactionUploadModal from "../../csvUpload/components/csvUploadModal";
import { getUploads } from "../api/uploadsApi";
import type { UploadSummary } from "../types/upload";
import { AccountMenu } from "../../../shared/components/AccountMenu";
import { EntityList } from "../../../shared/components/EntityList/EntityList";
import type { EntityListColumn, EntityListQuery } from "../../../shared/types/list";

interface UploadsPageProps {
    onOpenDashboard: () => void;
    onOpenAnalysisDashboard: () => void;
    onOpenCardSchemes: () => void;
    onOpenRules: () => void;
    onEditProfile: () => void;
}

const formatUploadedAt = (uploadedAt: string) => {
    const date = new Date(uploadedAt);
    return Number.isNaN(date.getTime()) ? uploadedAt : date.toLocaleString();
};

const statusClassName = (status: string) =>
    status === "COMPLETED" ? "entity-list-status active" : "entity-list-status inactive";

const columns: EntityListColumn<UploadSummary>[] = [
    {
        key: "fileName",
        label: "File name",
        sortable: true
    },
    {
        key: "uploadedAt",
        label: "Uploaded",
        sortable: true,
        render: (upload) => formatUploadedAt(upload.uploadedAt)
    },
    {
        key: "importStatus",
        label: "Import status",
        render: (upload) => (
            <span className={statusClassName(upload.importStatus)}>
                {upload.importStatus}
            </span>
        )
    },
    {
        key: "evaluationStatus",
        label: "Evaluation status",
        render: (upload) => (
            <span className={statusClassName(upload.evaluationStatus)}>
                {upload.evaluationStatus}
            </span>
        )
    },
    {
        key: "transactionCount",
        label: "Transactions",
        sortable: true
    }
];

export function UploadsPage({
    onOpenDashboard,
    onOpenAnalysisDashboard,
    onOpenCardSchemes,
    onOpenRules,
    onEditProfile
}: UploadsPageProps) {
    const { user } = useAuth();
    const [reloadKey, setReloadKey] = useState(0);
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";

    const fetchUploads = useCallback(
        (query: EntityListQuery, signal?: AbortSignal) => getUploads(query, signal),
        []
    );

    return (
        <main className="dashboard uploads-page">
            <div className="brand-decoration" aria-hidden="true">
                <span className="orb orb-blue orb-one"></span>
                <span className="orb orb-coral orb-two"></span>
                <span className="orb orb-white orb-three"></span>
                <span className="orb orb-blue orb-four"></span>
            </div>

            <header className="dashboard-header">
                <div className="welcome">
                    <h1>SchemeGuard AI</h1>
                    <p>Welcome, {user?.fullName}</p>
                </div>

                <div className="dashboard-account-actions">
                    <span className="role-badge">{user?.status} · MERCHANT</span>
                    <AccountMenu onEditProfile={onEditProfile} />
                </div>
            </header>

            <section className="content">
                <div className="page-heading">
                    <div>
                        <p className="eyebrow">UPLOADS WORKSPACE</p>
                        <h2>CSV uploads</h2>
                        <p>Upload transaction files and review their import history.</p>
                    </div>

                    <div className="page-heading-actions">
                        <button type="button" className="dashboard-button" onClick={onOpenDashboard}>
                            Transactions
                        </button>
                        <button type="button" className="dashboard-button" onClick={onOpenAnalysisDashboard}>
                            Analytics
                        </button>
                        <button type="button" className="dashboard-button" onClick={onOpenCardSchemes}>
                            Card schemes
                        </button>
                        <CsvTransactionUploadModal
                            onCompleted={() => setReloadKey((currentKey) => currentKey + 1)}
                        />
                        {isAdmin && (
                            <button type="button" className="create-rule-button" onClick={onOpenRules}>
                                View Rules
                            </button>
                        )}
                    </div>
                </div>

                <EntityList
                    title="Upload history"
                    description="Review every CSV document submitted to SchemeGuard AI."
                    columns={columns}
                    fetchData={fetchUploads}
                    reloadKey={reloadKey}
                    initialQuery={{ sort: "uploadedAt,desc" }}
                    searchPlaceholder="Search by file name..."
                    emptyMessage={"No CSV files uploaded yet.\nUpload a CSV file to begin."}
                />
            </section>
        </main>
    );
}