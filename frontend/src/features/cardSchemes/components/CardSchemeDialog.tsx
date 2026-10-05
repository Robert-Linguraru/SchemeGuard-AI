import { useState } from "react";
import { createCardScheme, updateCardScheme } from "../api/cardSchemeApi";
import type { CardScheme } from "../types/cardScheme";
import { Button } from "antd";

interface CardSchemeDialogProps {
    scheme?: CardScheme;
    onClose: () => void;
    onSaved: (scheme: CardScheme) => void;
}

export function CardSchemeDialog({
    scheme,
    onClose,
    onSaved
}: CardSchemeDialogProps) {
    const [code, setCode] = useState(scheme?.code ?? "");
    const [name, setName] = useState(scheme?.name ?? "");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        if (isSaving) return;
        const payload = { code: code.trim(), name: name.trim() };
        if (!payload.code || !payload.name) {
            setError("Code and name are required.");
            return;
        }
        setIsSaving(true);
        setError(null);

        try {
            const savedScheme = scheme
                ? await updateCardScheme(scheme.id, payload)
                : await createCardScheme(payload);
            onSaved(savedScheme);
        } catch (requestError) {
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "Could not save the card scheme."
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            className="entity-list-dialog-backdrop"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !isSaving) {
                    onClose();
                }
            }}
        >
            <section
                className="entity-list-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="card-scheme-dialog-title"
            >
                <div className="entity-list-dialog-heading">
                    <div>
                        <p className="eyebrow">CARD SCHEME</p>
                        <h2 id="card-scheme-dialog-title">{scheme ? "Edit card scheme" : "Create card scheme"}</h2>
                    </div>
                    <Button
                        type="text"
                        className="entity-list-dialog-close"
                        onClick={onClose}
                        disabled={isSaving}
                        aria-label="Close dialog"
                    >
                        ×
                    </Button>
                </div>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void save();
                    }}
                >
                    <label>
                        Code
                        <input
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            required
                            maxLength={30}
                            autoFocus
                            disabled={isSaving}
                        />
                    </label>
                    <label>
                        Name
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            required
                            maxLength={100}
                            disabled={isSaving}
                        />
                    </label>

                    {error && <p className="form-error" role="alert">{error}</p>}

                    <div className="entity-list-dialog-actions">
                        <Button
                            type="default"
                            className="secondary-button"
                            onClick={onClose}
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button type="primary" htmlType="submit" className="create-rule-button" disabled={isSaving}>
                            {isSaving ? "Saving..." : scheme ? "Save changes" : "Create card scheme"}
                        </Button>
                    </div>
                </form>
            </section>
        </div>
    );
}
