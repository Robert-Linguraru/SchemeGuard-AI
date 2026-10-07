import { useEffect, useState, type FormEvent } from "react";
import { uploadRule } from "../api/rulesApi";
import { getRuleErrorMessage } from "../api/ruleErrors";
import { RuleConditionFields } from "./RuleConditionFields";
import type { RuleCondition, RuleFormValues, RuleUploadResponse } from "../types/rule";
import { getAllActiveCardSchemes } from "../../cardSchemes/api/cardSchemeApi";
import type { CardScheme } from "../../cardSchemes/types/cardScheme";
import { Button } from "antd";

interface RuleFormProps {
    onSuccess: (response: RuleUploadResponse) => void;
}

const initialValues: RuleFormValues = {
    schemeId: "",
    ruleCode: "",
    ruleName: "",
    region: "EU",
    priority: "0",
    conditions: [],
    qualificationCategory: "",
    interchangeRate: "0",
    feeType: "PERCENTAGE",
    effectiveFrom: "",
    effectiveTo: "",
    version: "1",
    active: true
};

const initialConditions: RuleCondition[] = [{ field: "", operator: "", value: "" }];
const booleanFields = new Set(["merchantDataComplete", "threeDsUsed", "cvvPresent"]);
const numericFields = new Set(["clearingDelayDays"]);

export function RuleForm({ onSuccess }: RuleFormProps) {
    const [values, setValues] = useState(initialValues);
    const [conditions, setConditions] = useState(initialConditions);
    const [errors, setErrors] = useState<string[]>([]);
    const [requestError, setRequestError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [cardSchemes, setCardSchemes] = useState<CardScheme[]>([]);
    const [isLoadingCardSchemes, setIsLoadingCardSchemes] = useState(true);
    const [cardSchemeError, setCardSchemeError] = useState<string | null>(null);
    const [cardSchemeReloadKey, setCardSchemeReloadKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoadingCardSchemes(true);
        setCardSchemeError(null);

        void getAllActiveCardSchemes(controller.signal)
            .then(setCardSchemes)
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    setCardSchemeError(
                        error instanceof Error
                            ? error.message
                            : "Could not load active card schemes."
                    );
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoadingCardSchemes(false);
                }
            });

        return () => controller.abort();
    }, [cardSchemeReloadKey]);

    const updateValue = <Key extends keyof RuleFormValues>(key: Key, value: RuleFormValues[Key]) => {
        setValues((currentValues) => ({ ...currentValues, [key]: value }));
    };

    const reset = () => {
        setValues(initialValues);
        setConditions(initialConditions);
        setErrors([]);
        setRequestError(null);
    };

    const validate = (): string[] => {
        const validationErrors: string[] = [];
        const priority = Number(values.priority);
        const interchangeRate = Number(values.interchangeRate);
        const version = Number(values.version);

        if (!values.schemeId) validationErrors.push("Select a card scheme.");
        if (!values.ruleCode.trim()) validationErrors.push("Rule code is required.");
        if (!values.ruleName.trim()) validationErrors.push("Rule name is required.");
        if (!["EU", "US", "UK"].includes(values.region)) validationErrors.push("Region must be EU, US or UK.");
        if (!Number.isFinite(priority) || priority < 0) validationErrors.push("Priority must be a non-negative number.");
        if (conditions.length === 0) validationErrors.push("Add at least one condition.");
        conditions.forEach((condition, index) => {
            if (!condition.field.trim() || !condition.operator.trim() || String(condition.value).trim() === "") {
                validationErrors.push(`Condition ${index + 1} needs a field, operator and value.`);
            }
            if ((numericFields.has(condition.field) && !Number.isFinite(Number(condition.value)))) {
                validationErrors.push(`Condition ${index + 1} must use a numeric value.`);
            }
            if (booleanFields.has(condition.field) && !["true", "false"].includes(String(condition.value).toLowerCase())) {
                validationErrors.push(`Condition ${index + 1} must use true or false.`);
            }
        });
        if (!values.qualificationCategory.trim()) validationErrors.push("Qualification category is required.");
        if (!Number.isFinite(interchangeRate) || interchangeRate < 0) validationErrors.push("Interchange rate must be non-negative.");
        if (!values.feeType.trim()) validationErrors.push("Fee type is required.");
        if (!values.effectiveFrom) validationErrors.push("Effective-from date is required.");
        if (values.effectiveTo && values.effectiveFrom && values.effectiveTo < values.effectiveFrom) validationErrors.push("Effective-to cannot be earlier than effective-from.");
        if (!Number.isInteger(version) || version < 1) validationErrors.push("Version must be a positive integer.");
        return validationErrors;
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setRequestError(null);
        const validationErrors = validate();
        setErrors(validationErrors);
        if (validationErrors.length > 0) return;

        const formValues: RuleFormValues = { ...values, conditions };

        setIsSubmitting(true);
        try {
            const response = await uploadRule(formValues);
            onSuccess(response);
        } catch (error) {
            setRequestError(getRuleErrorMessage(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form className="rule-form" onSubmit={submit}>
            <section className="form-section">
                <div className="form-section-heading"><p className="eyebrow">IDENTITY</p><h3>Rule details</h3></div>
                <label>Card scheme
                    <select
                        value={values.schemeId}
                        onChange={(event) => updateValue("schemeId", event.target.value)}
                        disabled={isLoadingCardSchemes || cardSchemes.length === 0}
                        required
                    >
                        <option value="">
                            {isLoadingCardSchemes
                                ? "Loading card schemes..."
                                : cardSchemes.length === 0
                                    ? "No active card schemes available"
                                    : "Select a card scheme"}
                        </option>
                        {cardSchemes.map((scheme) => (
                            <option key={scheme.id} value={scheme.id}>
                                {scheme.name} ({scheme.code})
                            </option>
                        ))}
                    </select>
                    {cardSchemeError && (
                        <span className="field-help" role="alert">
                            Could not load card schemes: {cardSchemeError}{" "}
                            <button type="button" onClick={() => setCardSchemeReloadKey((key) => key + 1)}>
                                Retry
                            </button>
                        </span>
                    )}
                    {!isLoadingCardSchemes && !cardSchemeError && cardSchemes.length === 0 && (
                        <span className="field-help">Create or activate a card scheme before adding a rule.</span>
                    )}
                </label>
                <div className="form-grid">
                    <label>Rule code<input value={values.ruleCode} onChange={(event) => updateValue("ruleCode", event.target.value)} /></label>
                    <label>Rule name<input value={values.ruleName} onChange={(event) => updateValue("ruleName", event.target.value)} /></label>
                    <label>Region<select value={values.region} onChange={(event) => updateValue("region", event.target.value)}><option>EU</option><option>US</option><option>UK</option></select></label>
                    <label>Priority<input type="number" min="0" value={values.priority} onChange={(event) => updateValue("priority", event.target.value)} /></label>
                </div>
            </section>
            <RuleConditionFields conditions={conditions} onChange={setConditions} />
            <section className="form-section">
                <div className="form-section-heading"><p className="eyebrow">OUTCOME</p><h3>Qualification result</h3></div>
                <div className="form-grid">
                    <label>Qualification category<input value={values.qualificationCategory} onChange={(event) => updateValue("qualificationCategory", event.target.value)} /></label>
                    <label>Interchange rate<input type="number" min="0" step="0.0001" value={values.interchangeRate} onChange={(event) => updateValue("interchangeRate", event.target.value)} /></label>
                    <label>Fee type<input value={values.feeType} onChange={(event) => updateValue("feeType", event.target.value)} /></label>
                    <label>Version<input type="number" min="1" step="1" value={values.version} onChange={(event) => updateValue("version", event.target.value)} /></label>
                    <label>Effective from<input type="date" value={values.effectiveFrom} onChange={(event) => updateValue("effectiveFrom", event.target.value)} /></label>
                    <label><span className="form-field-label">Effective to <span className="optional">(optional)</span></span><input type="date" value={values.effectiveTo} onChange={(event) => updateValue("effectiveTo", event.target.value)} /></label>
                </div>
                <label className="checkbox-label"><input type="checkbox" checked={values.active} onChange={(event) => updateValue("active", event.target.checked)} /> Active</label>
            </section>
            {errors.length > 0 && <div className="form-error" role="alert"><strong>Check the form</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
            {requestError && <div className="form-error" role="alert"><strong>Could not create rule</strong><span>{requestError}</span></div>}
            <div className="form-actions"><Button type="primary" className="create-rule-submit-button" htmlType="submit" disabled={isSubmitting}>{isSubmitting ? "Creating rule..." : "Create rule"}</Button><Button className="secondary-button" onClick={reset} disabled={isSubmitting}>Reset</Button></div>
        </form>
    );
}
