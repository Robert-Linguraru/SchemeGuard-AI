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
        "uploads" | "dashboard" | "analysis-dashboard" | "rules" | "upload" | "details" | "profile" | "card-schemes"
    >("uploads");

    const [selectedRuleId, setSelectedRuleId] =
        useState<string | null>(null);
    const [selectedUploadId, setSelectedUploadId] =
        useState<string | null>(null);

    const isAdmin = user?.role?.toUpperCase() === "ADMIN";

    useEffect(() => {
        if (!isAdmin && (view === "rules" || view === "upload" || view === "details")) {
            setView("dashboard");
            setSelectedRuleId(null);
        }
    }, [isAdmin, view]);

    if (view === "uploads") {
        return (
            <UploadsPage
                onOpenDashboard={() => setView("dashboard")}
                onOpenAnalysisDashboard={() => setView("analysis-dashboard")}
                onOpenCardSchemes={() => setView("card-schemes")}
                onOpenRules={() => setView("rules")}
                onEditProfile={() => setView("profile")}
                onOpenUpload={(uploadId) => setSelectedUploadId(uploadId)}
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

    return (
            <DashboardPage
                onCreateRule={() => setView("rules")}
                onOpenCardSchemes={() => setView("card-schemes")}
                onEditProfile={() => setView("profile")}
                onOpenAnalysisDashboard={() => setView("analysis-dashboard")}
            />
    );
}

export function App() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState message="Restoring your session..." />;
    }

    return user ? <AuthenticatedApp /> : <AuthPage />;
}
