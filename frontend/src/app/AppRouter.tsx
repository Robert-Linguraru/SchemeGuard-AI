import { RuleUploadPage } from "../features/rules/pages/RuleUploadPage";
import { RulesPage } from "../features/rules/pages/RulesPage";
import { RuleDetailsPage } from "../features/rules/pages/RuleDetailsPage";
import { DashboardPage } from "../features/transactions/pages/DashboardPage";
import { AnalysisDashboardPage } from "../features/transactions/pages/AnalysisDashboardPage";
import { ProfilePage } from "../features/auth/pages/ProfilePage";
import { CardSchemesPage } from "../features/cardSchemes/pages/CardSchemesPage";
import { UploadsPage } from "../features/uploads/pages/UploadsPage";
import type { View } from "../shared/types/navigation";

type AppRouterProps = {
    view: View;
    selectedRuleId: string | null;
    selectedUploadId: string | null;
    selectedUploadFileName: string | null;
    selectedUploadImportStatus: string | null;
    selectedUploadWasEvaluated: boolean;
    onNavigate: (view: View) => void;
    onOpenRule: (id: string) => void;
    onOpenUpload: (
        uploadId: string,
        fileName: string,
        importStatus: string,
        wasEvaluated: boolean
    ) => void;
    onUploadEvaluated: (wasEvaluated: boolean) => void;
};

export function AppRouter({
    view,
    selectedRuleId,
    selectedUploadId,
    selectedUploadFileName,
    selectedUploadImportStatus,
    selectedUploadWasEvaluated,
    onNavigate,
    onOpenRule,
    onOpenUpload,
    onUploadEvaluated,
}: AppRouterProps) {
    switch (view) {
        case "dashboard":
            return (
                <UploadsPage
                    onOpenUpload={onOpenUpload}
                    selectedUploadId={selectedUploadId}
                />
            );

        case "upload":
            return (
                <RuleUploadPage
                    onBack={() => onNavigate("rules")}
                />
            );

        case "profile":
            return (
                <ProfilePage
                    onBack={() => onNavigate("dashboard")}
                />
            );

        case "analysis-dashboard":
            return <AnalysisDashboardPage />;

        case "card-schemes":
            return <CardSchemesPage />;

        case "details":
            return selectedRuleId ? (
                <RuleDetailsPage
                    ruleId={selectedRuleId}
                    onBack={() => onNavigate("rules")}
                    onDeleted={() => onNavigate("rules")}
                />
            ) : null;

        case "rules":
            return (
                <RulesPage
                    onCreateRule={() => onNavigate("upload")}
                    onOpenRule={onOpenRule}
                />
            );

        case "upload-details":
            return (
                <DashboardPage
                    selectedUploadId={selectedUploadId}
                    selectedUploadFileName={selectedUploadFileName}
                    selectedUploadImportStatus={selectedUploadImportStatus}
                    selectedUploadWasEvaluated={selectedUploadWasEvaluated}
                    onUploadEvaluated={onUploadEvaluated}
                />
            );

        default:
            return null;
    }
}
