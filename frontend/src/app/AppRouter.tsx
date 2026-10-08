import { RuleUploadPage } from "../features/rules/pages/RuleUploadPage";
import { RulesPage } from "../features/rules/pages/RulesPage";
import { RuleDetailsPage } from "../features/rules/pages/RuleDetailsPage";
import { DashboardPage } from "../features/transactions/pages/DashboardPage";
import { AnalysisDashboardPage } from "../features/transactions/pages/AnalysisDashboardPage";
import { ProfilePage } from "../features/auth/pages/ProfilePage";
import { CardSchemesPage } from "../features/cardSchemes/pages/CardSchemesPage";
import { UploadsPage } from "../features/uploads/pages/UploadsPage";
import { MyAgentPage } from "../features/agent/pages/MyAgentPage";
import type { View } from "../shared/types/navigation";
import type { AgentOpenContext, AgentTransactionContext } from "../shared/types/agent";
import type { Transaction } from "../shared/types/transaction";
import type { UploadSummary } from "../features/uploads/types/upload";

type AppRouterProps = {
    view: View;
    agentUserId: string;
    agentOpenContext: AgentOpenContext | null;
    onAgentOpenContextConsumed: () => void;
    onAskAgentAboutTransaction: (uploadId: string, transaction: AgentTransactionContext) => void;
    selectedRuleId: string | null;
    selectedUploadId: string | null;
    selectedUploadFileName: string | null;
    selectedUploadImportStatus: string | null;
    selectedUploadWasEvaluated: boolean;
    focusedAnalyticsTransaction: { id: string; externalId: string } | null;
    onReturnFromAgent: () => void;
    onOpenAnalyticsTransaction: (upload: UploadSummary, transaction: Transaction) => void;
    ruleCreationNotice: string | null;
    onRuleCreationNoticeShown: () => void;
    onRuleCreated: () => void;
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
    agentUserId,
    agentOpenContext,
    onAgentOpenContextConsumed,
    onAskAgentAboutTransaction,
    selectedRuleId,
    selectedUploadId,
    selectedUploadFileName,
    selectedUploadImportStatus,
    selectedUploadWasEvaluated,
    focusedAnalyticsTransaction,
    onReturnFromAgent,
    onOpenAnalyticsTransaction,
    ruleCreationNotice,
    onRuleCreationNoticeShown,
    onRuleCreated,
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
                    onRuleCreated={onRuleCreated}
                />
            );

        case "profile":
            return (
                <ProfilePage
                    onBack={() => onNavigate("dashboard")}
                />
            );

        case "analysis-dashboard":
            return <AnalysisDashboardPage onOpenTransaction={onOpenAnalyticsTransaction} />;

        case "card-schemes":
            return <CardSchemesPage />;

        case "my-agent":
            return (
                <MyAgentPage
                    userId={agentUserId}
                    initialContext={agentOpenContext}
                    onInitialContextConsumed={onAgentOpenContextConsumed}
                    onReturn={onReturnFromAgent}
                />
            );

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
                    successMessage={ruleCreationNotice}
                    onSuccessMessageShown={onRuleCreationNoticeShown}
                />
            );

        case "upload-details":
            return (
                <DashboardPage
                    onOpenRule={onOpenRule}
                    onAskAgentAboutTransaction={onAskAgentAboutTransaction}
                    selectedUploadId={selectedUploadId}
                    selectedUploadFileName={selectedUploadFileName}
                    selectedUploadImportStatus={selectedUploadImportStatus}
                    selectedUploadWasEvaluated={selectedUploadWasEvaluated}
                    focusedAnalyticsTransaction={focusedAnalyticsTransaction}
                    onUploadEvaluated={onUploadEvaluated}
                />
            );

        default:
            return null;
    }
}
