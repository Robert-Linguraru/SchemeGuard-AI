import { useCallback, useMemo, useState } from "react";
import { useAuth } from "../../../app/AuthProvider";
import { EntityList } from "../../../shared/components/EntityList/EntityList";
import type { EntityListQuery } from "../../../shared/types/list";
import {
    activateCardScheme,
    deleteCardScheme,
    deactivateCardScheme,
    getCardSchemes
} from "../api/cardSchemeApi";
import { createCardSchemeActions, cardSchemeColumns } from "../config/cardSchemeListConfig";
import { CardSchemeDialog } from "../components/CardSchemeDialog";
import type { CardScheme } from "../types/cardScheme";
import { App as AntdApp, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";

export function CardSchemesPage() {
    const { modal, notification } = AntdApp.useApp();
    const { user } = useAuth();
    const [editingScheme, setEditingScheme] = useState<CardScheme | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const fetchCardSchemes = useCallback(
        (query: EntityListQuery, signal?: AbortSignal) => getCardSchemes(query, signal),
        []
    );
    const runAction = async (
        actionKey: string,
        action: () => Promise<void>,
        successMessage: string
    ) => {
        setPendingAction(actionKey);
        setActionError(null);

        try {
            await action();
            notification.success({
                placement: "topRight",
                message: successMessage
            });
            setReloadKey((currentKey) => currentKey + 1);
        } catch (requestError) {
            setActionError(
                requestError instanceof Error
                    ? requestError.message
                    : "The card-scheme action could not be completed."
            );
        } finally {
            setPendingAction(null);
        }
    };

    const actions = useMemo(() => createCardSchemeActions({
        onEdit: (scheme) => {
            setActionError(null);
            setEditingScheme(scheme);
        },
        onActivate: (scheme) => {
            modal.confirm({
                title: `Activate ${scheme.name}?`,
                content: "Choose whether to activate associated rules, transactions and results too.",
                okText: "Activate all",
                cancelText: "Only this scheme",
                closable: false,
                keyboard: false,
                mask: { closable: false },
                onOk: () => runAction(
                    `activate-${scheme.id}`,
                    () => activateCardScheme(scheme.id, true),
                    "Card scheme and associated entities activated."
                ),
                onCancel: () => runAction(
                    `activate-${scheme.id}`,
                    () => activateCardScheme(scheme.id, false),
                    "Card scheme activated."
                )
            });
        },
        onDeactivate: (scheme) => {
            modal.confirm({
                title: `Deactivate ${scheme.name}?`,
                content: "This also deactivates its associated rules, transactions and results.",
                okText: "Deactivate",
                cancelText: "Cancel",
                okButtonProps: { danger: true },
                onOk: () => runAction(
                    `deactivate-${scheme.id}`,
                    () => deactivateCardScheme(scheme.id),
                    "Card scheme and associated entities deactivated."
                )
            });
        },
        onDelete: (scheme) => {
            modal.confirm({
                title: `Delete ${scheme.name}?`,
                content: "This permanently deletes the card scheme and all associated data. This cannot be undone.",
                okText: "Delete permanently",
                cancelText: "Cancel",
                okButtonProps: { danger: true },
                onOk: () => runAction(
                    `delete-${scheme.id}`,
                    () => deleteCardScheme(scheme.id),
                    "Card scheme and associated data deleted."
                )
            });
        },
        isBusy: () => pendingAction !== null
    }), [pendingAction]);

    return (
        <main className="dashboard card-scheme-page">
            <section className="content">
                <div className="page-heading">
                    <div>
                        <p className="eyebrow">CARD SCHEMES WORKSPACE</p>
                        <h2>Card schemes</h2>
                        <p>Search, sort and manage payment card schemes.</p>
                    </div>
                    {user?.role === "ADMIN" && (
                        <div className="heading-actions">
                            <Button
                                type="primary"
                                className="add-scheme-button"
                                icon={<PlusOutlined />}
                                //className="create-rule-button"
                                size="large"
                                disabled={pendingAction !== null}
                                onClick={() => {
                                    setActionError(null);
                                    setIsCreating(true);
                                }}
                            >
                                Add New Scheme
                            </Button>
                        </div>
                    )}
                </div>

                {actionError && <div className="form-error" role="alert">{actionError}</div>}
                <EntityList
                    title="All card schemes"
                    description="Active schemes are shown by default. Administrators can include inactive schemes."
                    columns={cardSchemeColumns}
                    fetchData={fetchCardSchemes}
                    actions={actions}
                    user={user}
                    reloadKey={reloadKey}
                    initialQuery={{ includeInactive: false }}
                    searchPlaceholder="Search by code or name..."
                    emptyMessage="No card schemes found."
                    toolbar={({ query, updateQuery }) => user?.role === "ADMIN" ? (
                        <label className="entity-list-checkbox">
                            <input
                                type="checkbox"
                                checked={query.includeInactive === true}
                                onChange={(event) => updateQuery({
                                    includeInactive: event.target.checked,
                                    page: 0
                                })}
                            />
                            <span>Include inactive</span>
                        </label>
                    ) : null}
                />
            </section>

            {(isCreating || editingScheme) && (
                <CardSchemeDialog
                    key={editingScheme?.id ?? "create"}
                    scheme={editingScheme ?? undefined}
                    onClose={() => {
                        setEditingScheme(null);
                        setIsCreating(false);
                    }}
                    onSaved={(savedScheme) => {
                        setEditingScheme(null);
                        setIsCreating(false);
                        notification.success({
                            placement: "topRight",
                            message: isCreating ? "Card scheme added" : "Card scheme updated",
                            description: `${savedScheme.name} was ${isCreating ? "added" : "updated"} successfully.`
                        });
                        setReloadKey((currentKey) => currentKey + 1);
                    }}
                />
            )}
        </main>
    );
}
