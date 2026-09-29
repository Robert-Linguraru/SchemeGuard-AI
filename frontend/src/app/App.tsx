import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthPage } from "../features/auth/pages/AuthPage";
import { LoadingState } from "../shared/components/LoadingState";
import NavBar from "../shared/components/NavBar";
import { AppRouter } from "./AppRouter";
import type { View } from "../shared/types/navigation";

function AuthenticatedApp() {
    const { user } = useAuth();
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
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";

    useEffect(() => {
        if (!isAdmin && (view === "rules" || view === "upload" || view === "details")) {
            setView("dashboard");
            setSelectedRuleId(null);
        }
    }, [isAdmin, view]);

    return (
        <div className="authenticated-app">
            <NavBar
                currentView={view}
                isAdmin={isAdmin}
                onViewChange={setView}
                onEditProfile={() => setView("profile")}
            />
            <AppRouter
                view={view}
                selectedRuleId={selectedRuleId}
                selectedUploadId={selectedUploadId}
                selectedUploadFileName={selectedUploadFileName}
                selectedUploadImportStatus={selectedUploadImportStatus}
                selectedUploadWasEvaluated={selectedUploadWasEvaluated}
                onNavigate={setView}
                onOpenRule={(id) => {
                    setSelectedRuleId(id);
                    setView("details");
                }}
                onOpenUpload={(uploadId, fileName, importStatus, wasEvaluated) => {
                    setSelectedUploadId(uploadId);
                    setSelectedUploadFileName(fileName);
                    setSelectedUploadImportStatus(importStatus);
                    setSelectedUploadWasEvaluated(wasEvaluated);
                    setView("upload-details");
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
