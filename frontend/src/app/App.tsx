import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { AuthPage } from "../features/auth/pages/AuthPage";
import { LoadingState } from "../shared/components/LoadingState";
import NavBar from "../shared/components/NavBar";
import { AppRouter } from "./AppRouter";
import { useTheme } from "./ThemeProvider";
import type { View } from "../shared/types/navigation";

function AuthenticatedApp({
    routeUploadId,
    routeView
}: {
    routeUploadId: string | null;
    routeView: View | null;
}) {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigateUrl = useNavigate();
    const [view, setView] = useState<View>(
        routeUploadId ? "upload-details" : routeView ?? "dashboard"
    );

    const [selectedRuleId, setSelectedRuleId] =
        useState<string | null>(null);
    const [selectedUploadId, setSelectedUploadId] =
        useState<string | null>(routeUploadId);
    const [selectedUploadFileName, setSelectedUploadFileName] =
        useState<string | null>(null);
    const [selectedUploadImportStatus, setSelectedUploadImportStatus] =
        useState<string | null>(null);
    const [selectedUploadWasEvaluated, setSelectedUploadWasEvaluated] =
        useState(false);
    const [ruleCreationNotice, setRuleCreationNotice] = useState<string | null>(null);
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";

    const navigate = (nextView: View) => {
        setView(nextView);
        if (nextView === "dashboard") {
            navigateUrl("/uploads");
        }
        if (nextView === "analysis-dashboard") {
            navigateUrl("/analytics");
        }
        if (nextView !== "upload-details") {
            setIsAssistantOpen(false);
        }
    };

    useEffect(() => {
        if (routeUploadId) {
            setSelectedUploadId(routeUploadId);
            setView("upload-details");
        } else if (routeView) {
            setSelectedUploadId(null);
            setView(routeView);
        } else {
            setSelectedUploadId(null);
            setView("dashboard");
        }
    }, [routeUploadId, routeView]);

    useEffect(() => {
        if (!isAdmin && (view === "rules" || view === "upload")) {
            setView("dashboard");
            setSelectedRuleId(null);
        }
    }, [isAdmin, view]);

    return (
        <div className="authenticated-app">
            <NavBar
                currentView={view}
                isAdmin={isAdmin}
                onViewChange={navigate}
                onEditProfile={() => setView("profile")}
                theme={theme}
                onToggleTheme={toggleTheme}
            />
            <AppRouter
                view={view}
                selectedRuleId={selectedRuleId}
                selectedUploadId={selectedUploadId}
                selectedUploadFileName={selectedUploadFileName}
                selectedUploadImportStatus={selectedUploadImportStatus}
                selectedUploadWasEvaluated={selectedUploadWasEvaluated}
                ruleCreationNotice={ruleCreationNotice}
                onRuleCreationNoticeShown={() => setRuleCreationNotice(null)}
                onRuleCreated={() => {
                    setRuleCreationNotice("Rule created successfully.");
                    navigate("rules");
                }}
                onNavigate={navigate}
                onOpenRule={(id) => {
                    setSelectedRuleId(id);
                    navigate("details");
                }}
                onOpenUpload={(uploadId, fileName, importStatus, wasEvaluated) => {
                    setSelectedUploadId(uploadId);
                    setSelectedUploadFileName(fileName);
                    setSelectedUploadImportStatus(importStatus);
                    setSelectedUploadWasEvaluated(wasEvaluated);
                    navigate("upload-details");
                    navigateUrl(`/uploads/${encodeURIComponent(uploadId)}`);
                }}
                onUploadEvaluated={(wasEvaluated) => setSelectedUploadWasEvaluated(wasEvaluated)}
                onOpenAssistant={() => setIsAssistantOpen(true)}
                onCloseAssistant={() => setIsAssistantOpen(false)}
                isAssistantOpen={isAssistantOpen}
            />
        </div>
    );
}

export function App({
    routeUploadId = null,
    routeView = null
}: {
    routeUploadId?: string | null;
    routeView?: View | null;
}) {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState message="Restoring your session..." />;
    }

    return user
        ? <AuthenticatedApp routeUploadId={routeUploadId} routeView={routeView} />
        : <AuthPage />;
}
