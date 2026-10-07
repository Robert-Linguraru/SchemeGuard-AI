import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthPage } from "../features/auth/pages/AuthPage";
import { LoadingState } from "../shared/components/LoadingState";
import NavBar from "../shared/components/NavBar";
import { AppRouter } from "./AppRouter";
import { useTheme } from "./ThemeProvider";
import type { View } from "../shared/types/navigation";
import type { AgentOpenContext, AgentTransactionContext } from "../shared/types/agent";

function AuthenticatedApp() {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [view, setView] = useState<View>("dashboard");

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
    const [ruleCreationNotice, setRuleCreationNotice] = useState<string | null>(null);
    const [agentOpenContext, setAgentOpenContext] = useState<AgentOpenContext | null>(null);
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";

    const navigate = (nextView: View) => {
        setView(nextView);
    };

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
                agentUserId={user?.id ?? ""}
                agentOpenContext={agentOpenContext}
                onAgentOpenContextConsumed={() => setAgentOpenContext(null)}
                onAskAgentAboutTransaction={(uploadId: string, transaction: AgentTransactionContext) => {
                    setAgentOpenContext({ requestId: Date.now(), uploadId, transaction });
                    navigate("my-agent");
                }}
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
                }}
                onUploadEvaluated={(wasEvaluated) => setSelectedUploadWasEvaluated(wasEvaluated)}
            />
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
