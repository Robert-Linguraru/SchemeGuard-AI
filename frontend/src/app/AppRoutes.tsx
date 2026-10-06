import { Navigate, Route, Routes, useParams } from "react-router-dom";
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

function UploadRoute() {
    const { uploadId } = useParams<{ uploadId: string }>();

    return (
        <ProtectedRoute>
            <App routeUploadId={uploadId ?? null} />
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

export function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<App />} />
            <Route path="/login" element={<PublicAuthRoute mode="login" />} />
            <Route path="/register" element={<PublicAuthRoute mode="register" />} />
            <Route path="/uploads" element={<UploadRoute />} />
            <Route path="/uploads/:uploadId" element={<UploadRoute />} />
            <Route path="/analytics" element={<AnalyticsRoute />} />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}