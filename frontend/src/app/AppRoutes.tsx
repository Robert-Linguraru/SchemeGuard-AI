import { Navigate, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { App } from "./App";
import { LoadingState } from "../shared/components/LoadingState";
import { AuthPage } from "../features/auth/pages/AuthPage";

function NotFoundPage() {
    return (
        <main>
            <h1>Page not found</h1>
        </main>
    );
}

function PublicAuthRoute({ mode }: { mode: "login" | "register" }) {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState message="Restoring your session..." />;
    }

    return user ? <Navigate to="/" replace /> : <AuthPage mode={mode} />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState message="Restoring your session..." />;
    }

    return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function RootRoute() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <LoadingState message="Restoring your session..." />;
    }

    return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}

function HomeDashboardRoute() {
    return <ProtectedRoute><App routeView="home-dashboard" /></ProtectedRoute>;
}

function UploadRoute() {
    const { uploadId } = useParams<{ uploadId: string }>();

    return (
        <ProtectedRoute>
            <App routeUploadId={uploadId ?? null} routeView={uploadId ? null : "dashboard"} />
        </ProtectedRoute>
    );
}

function AgentRoute() {
    const [searchParams] = useSearchParams();

    return (
        <ProtectedRoute>
            <App
                routeView="my-agent"
                routeAgentUploadId={searchParams.get("uploadId")}
                routeAgentTransactionId={searchParams.get("transactionId")}
                routeAgentReturnPath={searchParams.get("returnTo")}
            />
        </ProtectedRoute>
    );
}

function AnalyticsRoute() {
    return (
        <ProtectedRoute>
            <App routeView="analysis-dashboard" />
        </ProtectedRoute>
    );
}

function CardSchemesRoute() {
    return (
        <ProtectedRoute>
            <App routeView="card-schemes" />
        </ProtectedRoute>
    );
}

function ProfileRoute() {
    return (
        <ProtectedRoute>
            <App routeView="profile" />
        </ProtectedRoute>
    );
}

function RulesRoute({ routeView }: { routeView: "rules" | "upload" }) {
    const location = useLocation();
    const routeState = location.state as { ruleCreationNotice?: string } | null;

    return (
        <ProtectedRoute>
            <App
                routeCreationNotice={routeState?.ruleCreationNotice ?? null}
                routeView={routeView}
            />
        </ProtectedRoute>
    );
}

function RuleDetailsRoute() {
    const { ruleId } = useParams<{ ruleId: string }>();

    return (
        <ProtectedRoute>
            <App routeView="details" routeRuleId={ruleId ?? null} />
        </ProtectedRoute>
    );
}

export function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/dashboard" element={<HomeDashboardRoute />} />
            <Route path="/login" element={<PublicAuthRoute mode="login" />} />
            <Route path="/register" element={<PublicAuthRoute mode="register" />} />
            <Route path="/uploads" element={<UploadRoute />} />
            <Route path="/assistant" element={<AgentRoute />} />
            <Route path="/uploads/:uploadId" element={<UploadRoute />} />
            <Route path="/analytics" element={<AnalyticsRoute />} />
            <Route path="/card-schemes" element={<CardSchemesRoute />} />
            <Route path="/profile" element={<ProfileRoute />} />
            <Route path="/rules" element={<RulesRoute routeView="rules" />} />
            <Route path="/rules/new" element={<RulesRoute routeView="upload" />} />
            <Route path="/rules/:ruleId" element={<RuleDetailsRoute />} />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}
