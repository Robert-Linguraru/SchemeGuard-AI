import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthPage } from "../features/auth/pages/AuthPage";
import { RuleUploadPage } from "../features/rules/pages/RuleUploadPage";
import { RulesPage } from "../features/rules/pages/RulesPage";
import { RuleDetailsPage } from "../features/rules/pages/RuleDetailsPage";
import { DashboardPage } from "../features/transactions/pages/DashboardPage";
import { AnalysisDashboardPage } from "../features/transactions/pages/AnalysisDashboardPage";
import { ProfilePage } from "../features/auth/pages/ProfilePage";
import { CardSchemesPage } from "../features/cardSchemes/pages/CardSchemesPage";
import { UploadsPage } from "../features/uploads/pages/UploadsPage";
import { LoadingState } from "../shared/components/LoadingState";

function AuthenticatedApp() {
    const { user } = useAuth();
    const [view, setView] = useState<
        "dashboard" | "analysis-dashboard" | "rules" | "upload" | "details" | "upload-details" | "profile" | "card-schemes"
    >("dashboard");

    const [selectedRuleId, setSelectedRuleId] =
        useState<string | null>(null);
    const [selectedUploadId, setSelectedUploadId] =
        useState<string | null>(null);
    const [selectedUploadFileName, setSelectedUploadFileName] =
        useState<string | null>(null);
    const [selectedUploadImportStatus, setSelectedUploadImportStatus] =
        useState<string | null>(null);
    const [selectedUploadWasEvaluated, setSelectedUploadWasEvaluated] =
        useState(false);
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";

    useEffect(() => {
        if (!isAdmin && (view === "rules" || view === "upload" || view === "details")) {
            setView("dashboard");
            setSelectedRuleId(null);
        }
    }, [isAdmin, view]);

    const navigationItems = [
        { view: "dashboard" as const, label: "CSV uploads", active: view === "dashboard" || view === "upload-details" },
        { view: "analysis-dashboard" as const, label: "Analytics", active: view === "analysis-dashboard" },
        { view: "card-schemes" as const, label: "Card schemes", active: view === "card-schemes" },
        ...(isAdmin ? [{ view: "rules" as const, label: "Rules", active: view === "rules" || view === "upload" || view === "details" }] : [])
    ];

    const renderPage = () => {
        if (view === "dashboard") {
            return (
                <UploadsPage
                    onEditProfile={() => setView("profile")}
                    onOpenUpload={(uploadId, fileName, importStatus, wasEvaluated) => {
                        setSelectedUploadId(uploadId);
                        setSelectedUploadFileName(fileName);
                        setSelectedUploadImportStatus(importStatus);
                        setSelectedUploadWasEvaluated(wasEvaluated);
                        setView("upload-details");
                    }}
                    selectedUploadId={selectedUploadId}
                />
            );
        }

        if (view === "upload") {
            return (
                <RuleUploadPage
                    onBack={() => setView("rules")}
                    onEditProfile={() => setView("profile")}
                />
            );
        }

        if (view === "profile") {
            return <ProfilePage onBack={() => setView("dashboard")} onEditProfile={() => setView("profile")} />;
        }

        if (view === "analysis-dashboard") {
            return (
                <AnalysisDashboardPage
                    onEditProfile={() => setView("profile")}
                />
            );
        }

        if (view === "card-schemes") {
            return (
                <CardSchemesPage
                    onEditProfile={() => setView("profile")}
                />
            );
        }

        if (view === "details" && selectedRuleId) {
            return (
                <RuleDetailsPage
                    ruleId={selectedRuleId}
                    onBack={() => setView("rules")}
                    onDeleted={() => setView("rules")}
                    onEditProfile={() => setView("profile")}
                />
            );
        }

        if (view === "rules") {
            return (
                <RulesPage
                    onCreateRule={() => setView("upload")}
                    onOpenRule={(id) => {
                        setSelectedRuleId(id);
                        setView("details");
                    }}
                    onEditProfile={() => setView("profile")}
                />
            );
        }

        if (view === "upload-details") {
            return (
                <DashboardPage
                    onEditProfile={() => setView("profile")}
                    selectedUploadId={selectedUploadId}
                    selectedUploadFileName={selectedUploadFileName}
                    selectedUploadImportStatus={selectedUploadImportStatus}
                    selectedUploadWasEvaluated={selectedUploadWasEvaluated}
                    onUploadEvaluated={(wasEvaluated) => setSelectedUploadWasEvaluated(wasEvaluated)}
                />
            );
        }

        return null;
    };

    return (
        <div className="authenticated-app">
            <nav className="app-navbar" aria-label="Main navigation">
                <div className="app-navbar-links">
                    {navigationItems.map((item) => (
                        <button
                            key={item.view}
                            type="button"
                            className="app-navbar-link"
                            aria-current={item.active ? "page" : undefined}
                            onClick={() => setView(item.view)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </nav>
            {renderPage()}
        </div>
    );
}

export function App() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState message="Restoring your session..." />;
    }

    return user ? <AuthenticatedApp /> : <AuthPage />;
}
