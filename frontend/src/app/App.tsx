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
import { RecommendationAssistant } from "../features/transactions/components/RecommendationAssistant";
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
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";

    useEffect(() => {
        if (!isAdmin && (view === "rules" || view === "upload" || view === "details")) {
            setView("dashboard");
            setSelectedRuleId(null);
        }
    }, [isAdmin, view]);

    if (view === "dashboard") {
        return (
            <UploadsPage
                onOpenAnalysisDashboard={() => setView("analysis-dashboard")}
                onOpenCardSchemes={() => setView("card-schemes")}
                onOpenRules={() => setView("rules")}
                onEditProfile={() => setView("profile")}
                onOpenUpload={(uploadId, fileName, importStatus, wasEvaluated) => {
                    setSelectedUploadId(uploadId);
                    setSelectedUploadFileName(fileName);
                    setSelectedUploadImportStatus(importStatus);
                    setSelectedUploadWasEvaluated(wasEvaluated);
                    setIsAssistantOpen(false);
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
                onBack={() => setView("dashboard")}
                onEditProfile={() => setView("profile")}
            />
        );
    }

    if (view === "card-schemes") {
        return (
            <CardSchemesPage
                onBack={() => setView("dashboard")}
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
                onBack={() => setView("dashboard")}
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
            <>
                <DashboardPage
                    onCreateRule={() => setView("rules")}
                    onOpenCardSchemes={() => setView("card-schemes")}
                    onEditProfile={() => setView("profile")}
                    onOpenAnalysisDashboard={() => setView("analysis-dashboard")}
                    onOpenAssistant={() => setIsAssistantOpen(true)}
                    isAssistantOpen={isAssistantOpen}
                    selectedUploadId={selectedUploadId}
                    selectedUploadFileName={selectedUploadFileName}
                    selectedUploadImportStatus={selectedUploadImportStatus}
                    selectedUploadWasEvaluated={selectedUploadWasEvaluated}
                    onUploadEvaluated={(wasEvaluated) => setSelectedUploadWasEvaluated(wasEvaluated)}
                    onBackToUploads={() => {
                        setIsAssistantOpen(false);
                        setSelectedUploadId(null);
                        setSelectedUploadFileName(null);
                        setSelectedUploadImportStatus(null);
                        setSelectedUploadWasEvaluated(false);
                        setView("dashboard");
                    }}
                />
                <RecommendationAssistant
                    uploadId={selectedUploadId}
                    fileName={selectedUploadFileName}
                    isOpen={isAssistantOpen}
                    onClose={() => setIsAssistantOpen(false)}
                />
            </>
        );
    }

    return null;
}

export function App() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState message="Restoring your session..." />;
    }

    return user ? <AuthenticatedApp /> : <AuthPage />;
}
