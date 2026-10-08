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
    routeView,
    routeRuleId,
    routeCreationNotice,
    routeAssistantOpen = false
}: {
    routeUploadId: string | null;
    routeView: View | null;
    routeRuleId: string | null;
    routeCreationNotice: string | null;
    routeAssistantOpen?: boolean;
}) {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigateUrl = useNavigate();
    const [view, setView] = useState<View>(
        routeUploadId
            ? "upload-details"
            : routeView ?? "dashboard"
    );

    const [selectedRuleId, setSelectedRuleId] =
        useState<string | null>(routeRuleId);
    const [selectedUploadId, setSelectedUploadId] =
        useState<string | null>(routeUploadId);
    const [selectedUploadFileName, setSelectedUploadFileName] =
        useState<string | null>(null);
    const [selectedUploadImportStatus, setSelectedUploadImportStatus] =
        useState<string | null>(null);
    const [selectedUploadWasEvaluated, setSelectedUploadWasEvaluated] =
        useState(false);
    const [ruleCreationNotice, setRuleCreationNotice] = useState<string | null>(routeCreationNotice);
    const [isAssistantOpen, setIsAssistantOpen] = useState(routeAssistantOpen);
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";

    const navigate = (nextView: View) => {
        setView(nextView);
        if (nextView === "dashboard") {
            navigateUrl("/uploads");
        }
        if (nextView === "analysis-dashboard") {
            navigateUrl("/analytics");
        }
        if (nextView === "card-schemes") {
            navigateUrl("/card-schemes");
        }
        if (nextView === "profile") {
            navigateUrl("/profile");
        }
        if (nextView === "rules") {
            navigateUrl("/rules");
        }
        if (nextView === "upload") {
            navigateUrl("/rules/new");
        }
        if (nextView !== "upload-details") {
            setIsAssistantOpen(false);
        }
    };

    useEffect(() => {
        if (routeUploadId) {
            setSelectedUploadId(routeUploadId);
            setView("upload-details");
            setIsAssistantOpen(routeAssistantOpen);
        } else if (routeRuleId) {
            setSelectedUploadId(null);
            setSelectedRuleId(routeRuleId);
            setView("details");
            setIsAssistantOpen(false);
        } else if (routeView) {
            setSelectedUploadId(null);
            setView(routeView);
            setIsAssistantOpen(false);
        } else {
            setSelectedUploadId(null);
            setView("dashboard");
            setIsAssistantOpen(false);
        }
    }, [routeAssistantOpen, routeRuleId, routeUploadId, routeView]);

    useEffect(() => {
        if (!isAdmin && (view === "rules" || view === "upload")) {
            setView("dashboard");
            setSelectedRuleId(null);
            navigateUrl("/uploads");
        }
    }, [isAdmin, navigateUrl, view]);

    return (
        <div className="authenticated-app">
            <NavBar
                currentView={view}
                isAdmin={isAdmin}
                onViewChange={navigate}
                onEditProfile={() => navigate("profile")}
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
                    navigateUrl("/rules", {
                        state: { ruleCreationNotice: "Rule created successfully." }
                    });
                }}
                onNavigate={navigate}
                onOpenRule={(id) => {
                    setSelectedRuleId(id);
                    navigate("details");
                    navigateUrl(`/rules/${encodeURIComponent(id)}`);
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
                onOpenAssistant={() => {
                    if (selectedUploadId) {
                        setIsAssistantOpen(true);
                        navigateUrl(`/uploads/${encodeURIComponent(selectedUploadId)}/assistant`);
                    }
                }}
                onCloseAssistant={() => {
                    setIsAssistantOpen(false);
                    if (selectedUploadId) {
                        navigateUrl(`/uploads/${encodeURIComponent(selectedUploadId)}`);
                    }
                }}
                isAssistantOpen={isAssistantOpen}
            />
        </div>
    );
}

export function App({
    routeUploadId = null,
    routeView = null,
    routeRuleId = null,
    routeCreationNotice = null,
    routeAssistantOpen = false
}: {
    routeUploadId?: string | null;
    routeView?: View | null;
    routeRuleId?: string | null;
    routeCreationNotice?: string | null;
    routeAssistantOpen?: boolean;
}) {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState message="Restoring your session..." />;
    }

    return user
        ? (
            <AuthenticatedApp
                routeRuleId={routeRuleId}
                routeCreationNotice={routeCreationNotice}
                routeUploadId={routeUploadId}
                routeView={routeView}
                routeAssistantOpen={routeAssistantOpen}
            />
        )
        : <AuthPage />;
}
