import { useState } from "react";
import { RuleForm } from "../components/RuleForm";
import type { RuleUploadResponse } from "../types/rule";

interface RuleUploadPageProps {
    onBack: () => void;
}

export function RuleUploadPage({ onBack }: RuleUploadPageProps) {
    const [createdRule, setCreatedRule] = useState<RuleUploadResponse | null>(null);

    return (
        <main className="dashboard rules-page">
            <section className="content">
                <div className="page-heading"><div><p className="eyebrow">RULES WORKSPACE</p><h2>Create a qualification rule</h2><p>Define the conditions and outcome the backend should apply to transactions.</p></div><button className="secondary-button page-nav-button" onClick={onBack}>View Rules</button></div>
                <section className="rule-builder-card">
                    {createdRule && <div className="success-box" role="status">Created <strong>{createdRule.ruleCode}</strong> with ID <strong>{createdRule.id}</strong>. <button type="button" onClick={() => setCreatedRule(null)}>Create another rule</button></div>}
                    {!createdRule && <RuleForm onSuccess={setCreatedRule} />}
                </section>
            </section>
        </main>
    );
}
