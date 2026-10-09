import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { AuthPage } from "../features/auth/pages/AuthPage";
import { LoadingState } from "../shared/components/LoadingState";
import NavBar from "../shared/components/NavBar";
import { AppRouter } from "./AppRouter";
import { useTheme } from "./ThemeProvider";
import type { View } from "../shared/types/navigation";
import type { AgentOpenContext, AgentTransactionContext } from "../shared/types/agent";
import type { UploadSummary } from "../features/uploads/types/upload";
import type { Transaction } from "../shared/types/transaction";
import { getUploadTransactions } from "../features/uploads/api/uploadsApi";

const safeReturnPath = (path: string | null | undefined): string =>
    path && path.startsWith("/") && !path.startsWith("//") ? path : "/uploads";

function AuthenticatedApp({
    routeUploadId,
    routeView,
    routeRuleId,
    routeCreationNotice,
    routeAgentUploadId,
    routeAgentTransactionId,
    routeAgentReturnPath
}: {
    routeUploadId: string | null;
    routeView: View | null;
    routeRuleId: string | null;
    routeCreationNotice: string | null;
    routeAgentUploadId: string | null;
    routeAgentTransactionId: string | null;
    routeAgentReturnPath: string | null;
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
    const [agentOpenContext, setAgentOpenContext] = useState<AgentOpenContext | null>(null);
    const [focusedAnalyticsTransaction, setFocusedAnalyticsTransaction] =
        useState<{ id: string; externalId: string } | null>(null);
    const hydratedAgentRouteContext = useRef<string | null>(null);
    const isAdmin = user?.role?.toUpperCase() === "ADMIN";

    const navigate = (
        nextView: View,
        options: { path?: string; state?: unknown; agentContext?: AgentOpenContext } = {}
    ) => {
        setView(nextView);
        if (nextView === "my-agent") {
            const context = options.agentContext ?? agentOpenContext;
            const query = new URLSearchParams();
            if (context) {
                query.set("uploadId", context.uploadId);
                query.set("transactionId", context.transaction.id);
            }
            query.set("returnTo", safeReturnPath(options.path ?? routeAgentReturnPath));
            navigateUrl(`/assistant?${query.toString()}`);
            return;
        }
        const defaultPaths: Partial<Record<View, string>> = {
            dashboard: "/uploads",
            "analysis-dashboard": "/analytics",
            "card-schemes": "/card-schemes",
            profile: "/profile",
            rules: "/rules",
            upload: "/rules/new"
        };
        const path = options.path ?? defaultPaths[nextView];
        if (path) navigateUrl(path, { state: options.state });
    };

    useEffect(() => {
        if (routeUploadId) {
            setSelectedUploadId(routeUploadId);
            setView("upload-details");
        } else if (routeRuleId) {
            setSelectedUploadId(null);
            setSelectedRuleId(routeRuleId);
            setView("details");
        } else if (routeView) {
            setSelectedUploadId(null);
            setView(routeView);
        } else {
            setSelectedUploadId(null);
            setView("dashboard");
        }
    }, [routeRuleId, routeUploadId, routeView]);

    useEffect(() => {
        if (!routeAgentUploadId || !routeAgentTransactionId) return;
        const routeContextKey = `${routeAgentUploadId}:${routeAgentTransactionId}`;
        if (hydratedAgentRouteContext.current === routeContextKey) return;
        if (agentOpenContext?.uploadId === routeAgentUploadId
            && agentOpenContext.transaction.id === routeAgentTransactionId) {
            hydratedAgentRouteContext.current = routeContextKey;
            return;
        }

        const controller = new AbortController();
        void (async () => {
            let page = 0;
            let totalPages = 1;
            while (page < totalPages && !controller.signal.aborted) {
                const result = await getUploadTransactions(
                    routeAgentUploadId,
                    { page, size: 100, search: "", sort: "createdAt,desc" },
                    controller.signal
                );
                const transaction = result.items.find((item) => item.id === routeAgentTransactionId);
                if (transaction) {
                    hydratedAgentRouteContext.current = routeContextKey;
                    setAgentOpenContext({
                        requestId: Date.now(),
                        uploadId: routeAgentUploadId,
                        transaction: {
                            id: transaction.id,
                            externalId: transaction.externalId,
                            qualificationStatus: transaction.qualificationStatus
                        }
                    });
                    return;
                }
                totalPages = result.totalPages;
                page += 1;
            }
        })().catch(() => {
            // The agent remains available without transaction context if the upload cannot be rehydrated.
        });
        return () => controller.abort();
    }, [agentOpenContext, routeAgentTransactionId, routeAgentUploadId]);

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
                agentUserId={user?.id ?? ""}
                agentUserName={user?.fullName || "there"}
                agentOpenContext={agentOpenContext}
                onAgentOpenContextConsumed={() => setAgentOpenContext(null)}
                onAskAgentAboutTransaction={(uploadId: string, transaction: AgentTransactionContext) => {
                    const context = { requestId: Date.now(), uploadId, transaction };
                    setAgentOpenContext(context);
                    navigate("my-agent", {
                        path: `/uploads/${encodeURIComponent(uploadId)}`,
                        agentContext: context
                    });
                }}
                selectedRuleId={selectedRuleId}
                selectedUploadId={selectedUploadId}
                selectedUploadFileName={selectedUploadFileName}
                selectedUploadImportStatus={selectedUploadImportStatus}
                selectedUploadWasEvaluated={selectedUploadWasEvaluated}
                focusedAnalyticsTransaction={focusedAnalyticsTransaction}
                onOpenAnalyticsTransaction={(upload: UploadSummary, transaction: Transaction) => {
                    setSelectedUploadId(upload.id);
                    setSelectedUploadFileName(upload.fileName);
                    setSelectedUploadImportStatus(upload.importStatus);
                    setSelectedUploadWasEvaluated(upload.wasEvaluated);
                    setFocusedAnalyticsTransaction({ id: transaction.id, externalId: transaction.externalId });
                    navigate("upload-details", {
                        path: `/uploads/${encodeURIComponent(upload.id)}`
                    });
                }}
                ruleCreationNotice={ruleCreationNotice}
                onRuleCreationNoticeShown={() => setRuleCreationNotice(null)}
                onRuleCreated={() => {
                    setRuleCreationNotice("Rule created successfully.");
                    navigate("rules", {
                        state: { ruleCreationNotice: "Rule created successfully." }
                    });
                }}
                onNavigate={navigate}
                onOpenRule={(id) => {
                    setSelectedRuleId(id);
                    navigate("details", { path: `/rules/${encodeURIComponent(id)}` });
                }}
                onOpenUpload={(uploadId, fileName, importStatus, wasEvaluated) => {
                    setSelectedUploadId(uploadId);
                    setSelectedUploadFileName(fileName);
                    setSelectedUploadImportStatus(importStatus);
                    setSelectedUploadWasEvaluated(wasEvaluated);
                    setFocusedAnalyticsTransaction(null);
                    navigate("upload-details", {
                        path: `/uploads/${encodeURIComponent(uploadId)}`
                    });
                }}
                onUploadEvaluated={(wasEvaluated) => setSelectedUploadWasEvaluated(wasEvaluated)}
                onReturnFromAgent={() => navigateUrl(safeReturnPath(routeAgentReturnPath))}
            />
        </div>
    );
}

export function App({
    routeUploadId = null,
    routeView = null,
    routeRuleId = null,
    routeCreationNotice = null,
    routeAgentUploadId = null,
    routeAgentTransactionId = null,
    routeAgentReturnPath = null
}: {
    routeUploadId?: string | null;
    routeView?: View | null;
    routeRuleId?: string | null;
    routeCreationNotice?: string | null;
    routeAgentUploadId?: string | null;
    routeAgentTransactionId?: string | null;
    routeAgentReturnPath?: string | null;
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
                routeAgentUploadId={routeAgentUploadId}
                routeAgentTransactionId={routeAgentTransactionId}
                routeAgentReturnPath={routeAgentReturnPath}
            />
        )
        : <AuthPage />;
}
