import { useState } from "react";
import { createCardScheme, updateCardScheme } from "../api/cardSchemeApi";
import type { CardScheme } from "../types/cardScheme";

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
                    <button
                        type="button"
                        className="entity-list-dialog-close"
                        onClick={onClose}
                        disabled={isSaving}
                        aria-label="Close dialog"
                    >
                        ×
                    </button>
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
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={onClose}
                            disabled={isSaving}
                        >
                            Cancel
                        </button>
                        <button type="submit" className="create-rule-button" disabled={isSaving}>
                            {isSaving ? "Saving..." : scheme ? "Save changes" : "Create card scheme"}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}
