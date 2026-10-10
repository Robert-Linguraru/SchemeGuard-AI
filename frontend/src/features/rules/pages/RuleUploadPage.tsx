import { RuleForm } from "../components/RuleForm";
import { Button } from "antd";
import { FloatingBackground } from "../../../shared/components/FloatingBackground";

interface RuleUploadPageProps {
    onBack: () => void;
    onRuleCreated: () => void;
}

export function RuleUploadPage({ onBack, onRuleCreated }: RuleUploadPageProps) {
    return (
        <main className="dashboard rules-page">
            <FloatingBackground />
            <section className="content">
                <div className="page-heading"><div><p className="eyebrow">RULES WORKSPACE</p><h2>Create a qualification rule</h2><p>Define the conditions and outcome the backend should apply to transactions.</p></div><Button className="secondary-button page-nav-button" onClick={onBack}>View Rules</Button></div>
                <section className="rule-builder-card">
                    <RuleForm onSuccess={onRuleCreated} />
                </section>
            </section>
        </main>
    );
}
