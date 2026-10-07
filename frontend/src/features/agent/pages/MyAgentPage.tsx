import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Input, Select, Spin } from "antd";
import { DeleteOutlined, RobotOutlined, SendOutlined } from "@ant-design/icons";
import { getUploadTransactions, getUploads } from "../../uploads/api/uploadsApi";
import type { UploadSummary } from "../../uploads/types/upload";
import type { Transaction } from "../../../shared/types/transaction";
import type { AgentOpenContext } from "../../../shared/types/agent";
import { chatWithAgent, type AgentTurn } from "../api/agentApi";

const suggestions = [
    "Why is this transaction not qualified?",
    "How can I improve this transaction to qualify for a lower fee?",
    "Show all anomalies in this upload",
    "Compare the fees and attributes of transactions in this upload",
];

interface AgentMessage extends AgentTurn {
    invalid?: boolean;
}

interface SelectedTransaction {
    id: string;
    externalId: string;
    qualificationStatus: string;
}

interface AgentConversation {
    id: string;
    title: string;
    messages: AgentMessage[];
    uploadId: string | null;
    selectedTransactions: SelectedTransaction[];
    updatedAt: number;
}

interface ConversationState {
    conversations: AgentConversation[];
    activeId: string;
}

interface StreamingMessage {
    conversationId: string;
    messageIndex: number;
    textLength: number;
    visibleLength: number;
}

const createConversation = (context?: AgentOpenContext): AgentConversation => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: "New chat",
    messages: [],
    uploadId: context?.uploadId ?? null,
    selectedTransactions: context
        ? [{
            id: context.transaction.id,
            externalId: context.transaction.externalId,
            qualificationStatus: context.transaction.qualificationStatus,
        }]
        : [],
    updatedAt: Date.now(),
});

const readConversationState = (storageKey: string): ConversationState => {
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            const parsed = JSON.parse(saved) as ConversationState;
            if (Array.isArray(parsed.conversations) && parsed.conversations.length > 0) {
                parsed.conversations = parsed.conversations.map((conversation) => ({
                    ...conversation,
                    selectedTransactions: conversation.uploadId
                        ? (conversation.selectedTransactions ?? []).slice(0, 2)
                        : [],
                }));
                const activeId = parsed.conversations.some((chat) => chat.id === parsed.activeId)
                    ? parsed.activeId
                    : parsed.conversations[0].id;
                return { conversations: parsed.conversations, activeId };
            }
        }
    } catch {
        // Start a fresh local chat list when browser storage is unavailable or invalid.
    }
    const firstConversation = createConversation();
    return { conversations: [firstConversation], activeId: firstConversation.id };
};

const qualificationBadge = (status: string) => status.toUpperCase() === "QUALIFIED" ? "Q" : "NQ";

export function MyAgentPage({
    userId,
    initialContext,
    onInitialContextConsumed,
}: {
    userId: string;
    initialContext: AgentOpenContext | null;
    onInitialContextConsumed: () => void;
}) {
    const storageKey = `schemeguard-agent-chats:${userId}`;
    const [chatState, setChatState] = useState<ConversationState>(() => readConversationState(storageKey));
    const [uploads, setUploads] = useState<UploadSummary[]>([]);
    const [loadingUploads, setLoadingUploads] = useState(true);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [transactionPage, setTransactionPage] = useState(0);
    const [transactionTotalPages, setTransactionTotalPages] = useState(0);
    const [transactionSearch, setTransactionSearch] = useState("");
    const [contextError, setContextError] = useState<string | null>(null);
    const [prompt, setPrompt] = useState("");
    const [sendingConversationId, setSendingConversationId] = useState<string | null>(null);
    const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
    const [requestError, setRequestError] = useState<{ conversationId: string; message: string } | null>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const consumedContextId = useRef<number | null>(null);

    const activeConversation = chatState.conversations.find((chat) => chat.id === chatState.activeId)
        ?? chatState.conversations[0];
    const isBusy = sendingConversationId !== null || streamingMessage !== null;

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(chatState));
        } catch {
            // The current session remains usable even if browser storage is full or disabled.
        }
    }, [chatState, storageKey]);

    useEffect(() => {
        const controller = new AbortController();
        void (async () => {
            try {
                const allUploads: UploadSummary[] = [];
                let page = 0;
                let totalPages = 1;
                while (page < totalPages) {
                    const result = await getUploads(
                        { page, size: 100, search: "", sort: "uploadedAt,desc" },
                        controller.signal
                    );
                    allUploads.push(...result.items);
                    totalPages = result.totalPages;
                    page += 1;
                }
                if (!controller.signal.aborted) setUploads(allUploads);
            } catch (error: unknown) {
                if (!controller.signal.aborted) {
                    setContextError(error instanceof Error ? error.message : "Could not load your uploads.");
                }
            } finally {
                if (!controller.signal.aborted) setLoadingUploads(false);
            }
        })();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!initialContext || consumedContextId.current === initialContext.requestId) return;
        consumedContextId.current = initialContext.requestId;
        const newChat = createConversation(initialContext);
        setChatState((current) => ({
            conversations: [newChat, ...current.conversations],
            activeId: newChat.id,
        }));
        setTransactionPage(0);
        setPrompt("");
        setRequestError(null);
        onInitialContextConsumed();
    }, [initialContext, onInitialContextConsumed]);

    useEffect(() => {
        const uploadId = activeConversation?.uploadId;
        if (!uploadId) {
            setTransactions([]);
            setTransactionTotalPages(0);
            setLoadingTransactions(false);
            return;
        }

        const controller = new AbortController();
        setLoadingTransactions(true);
        setContextError(null);
        const timer = window.setTimeout(() => {
            void getUploadTransactions(uploadId, {
                page: transactionPage,
                size: 20,
                search: transactionSearch.trim(),
                sort: "createdAt,desc",
            }, controller.signal)
            .then((result) => {
                if (!controller.signal.aborted) {
                    setTransactions(result.items);
                    setTransactionTotalPages(result.totalPages);
                }
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    setContextError(error instanceof Error ? error.message : "Could not load transactions.");
                    setTransactions([]);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoadingTransactions(false);
            });
        }, 250);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [activeConversation?.uploadId, transactionPage, transactionSearch]);

    useEffect(() => {
        if (!streamingMessage) return;
        const step = Math.max(2, Math.ceil(streamingMessage.textLength / 150));
        const timer = window.setTimeout(() => {
            setStreamingMessage((current) => {
                if (!current) return current;
                const nextVisibleLength = Math.min(current.textLength, current.visibleLength + step);
                return nextVisibleLength >= current.textLength
                    ? null
                    : { ...current, visibleLength: nextVisibleLength };
            });
        }, 14);
        return () => window.clearTimeout(timer);
    }, [streamingMessage]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeConversation?.messages, sendingConversationId, streamingMessage?.visibleLength]);

    const updateConversation = (conversationId: string, updater: (conversation: AgentConversation) => AgentConversation) => {
        setChatState((current) => ({
            ...current,
            conversations: current.conversations.map((conversation) =>
                conversation.id === conversationId
                    ? { ...updater(conversation), updatedAt: Date.now() }
                    : conversation
            ),
        }));
    };

    const startNewChat = () => {
        const newChat = createConversation();
        setChatState((current) => ({
            conversations: [newChat, ...current.conversations],
            activeId: newChat.id,
        }));
        setTransactionPage(0);
        setTransactionSearch("");
        setPrompt("");
        setRequestError(null);
    };

    const selectConversation = (conversationId: string) => {
        setChatState((current) => ({ ...current, activeId: conversationId }));
        setTransactionPage(0);
        setTransactionSearch("");
        setPrompt("");
        setRequestError(null);
    };

    const deleteConversation = (conversationId: string) => {
        const replacement = createConversation();
        setChatState((current) => {
            const conversations = current.conversations.filter((conversation) => conversation.id !== conversationId);
            if (conversations.length === 0) return { conversations: [replacement], activeId: replacement.id };
            return {
                conversations,
                activeId: current.activeId === conversationId ? conversations[0].id : current.activeId,
            };
        });
        if (chatState.activeId === conversationId) {
            setPrompt("");
            setTransactionPage(0);
            setTransactionSearch("");
            setRequestError(null);
        }
    };

    const changeUpload = (nextUploadId: string | null) => {
        if (!activeConversation || activeConversation.uploadId === nextUploadId) return;
        setTransactionPage(0);
        setTransactionSearch("");
        setRequestError(null);
        updateConversation(activeConversation.id, (conversation) => ({
            ...conversation,
            uploadId: nextUploadId,
            selectedTransactions: [],
        }));
    };

    const addTransaction = (transaction: Transaction) => {
        if (!activeConversation || activeConversation.selectedTransactions.length >= 2) return;
        if (activeConversation.selectedTransactions.some((selected) => selected.id === transaction.id)) return;
        const selected: SelectedTransaction = {
            id: transaction.id,
            externalId: transaction.externalId,
            qualificationStatus: transaction.qualificationStatus,
        };
        updateConversation(activeConversation.id, (conversation) => ({
            ...conversation,
            selectedTransactions: [...conversation.selectedTransactions, selected],
        }));
    };

    const removeTransaction = (transactionId: string) => {
        if (!activeConversation) return;
        updateConversation(activeConversation.id, (conversation) => ({
            ...conversation,
            selectedTransactions: conversation.selectedTransactions.filter((transaction) => transaction.id !== transactionId),
        }));
    };

    const chooseSuggestion = (question: string) => {
        setPrompt(question);
        document.querySelector<HTMLTextAreaElement>(".my-agent-composer textarea")?.focus();
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!activeConversation) return;
        const question = prompt.trim();
        if (!question || isBusy) return;

        const conversationId = activeConversation.id;
        const priorMessages = activeConversation.messages.slice(-8).map(({ role, content }) => ({ role, content }));
        updateConversation(conversationId, (conversation) => ({
            ...conversation,
            title: conversation.title === "New chat" ? question.slice(0, 42) : conversation.title,
            messages: [...conversation.messages, { role: "user", content: question }],
        }));
        setPrompt("");
        setRequestError(null);
        setSendingConversationId(conversationId);

        try {
            const response = await chatWithAgent(
                question,
                activeConversation.uploadId,
                activeConversation.selectedTransactions.map((transaction) => transaction.id),
                priorMessages
            );
            const assistantMessage: AgentMessage = {
                role: "assistant",
                content: response.message,
                invalid: !response.validQuestion,
            };
            const messageIndex = activeConversation.messages.length + 1;
            updateConversation(conversationId, (conversation) => {
                return { ...conversation, messages: [...conversation.messages, assistantMessage] };
            });
            setStreamingMessage({
                conversationId,
                messageIndex,
                textLength: response.message.length,
                visibleLength: 0,
            });
        } catch {
            updateConversation(conversationId, (conversation) => ({
                ...conversation,
                messages: [...conversation.messages, {
                    role: "assistant",
                    content: "I’m having trouble analyzing that context right now. Please try again in a moment.",
                }],
            }));
            setRequestError(null);
            // Keep invalid or unavailable answers in the chat as a helpful, in-scope response.
        } finally {
            setSendingConversationId(null);
        }
    };

    return (
        <main className="dashboard my-agent-page">
            <section className="my-agent-shell">
                <aside className="my-agent-history" aria-label="Chat history">
                    <div className="my-agent-panel-heading">
                        <h2>Chat history</h2>
                        <Button type="primary" onClick={startNewChat} disabled={isBusy}>New chat</Button>
                    </div>
                    <div className="my-agent-history-list">
                        {chatState.conversations.map((conversation) => (
                            <div
                                className={`my-agent-history-entry${conversation.id === chatState.activeId ? " active" : ""}`}
                                key={conversation.id}
                            >
                                <button type="button" className="my-agent-history-item" onClick={() => selectConversation(conversation.id)}>
                                    <strong>{conversation.title}</strong>
                                    <span>{conversation.messages.at(-1)?.content ?? "New conversation"}</span>
                                </button>
                                <button
                                    type="button"
                                    className="my-agent-delete-chat"
                                    aria-label={`Delete chat ${conversation.title}`}
                                    title="Delete chat"
                                    disabled={isBusy}
                                    onClick={() => deleteConversation(conversation.id)}
                                ><DeleteOutlined /></button>
                            </div>
                        ))}
                    </div>
                </aside>

                <section className="my-agent-main">
                    <header className="my-agent-heading">
                        <div className="my-agent-title-icon"><RobotOutlined /></div>
                        <div>
                            <p className="my-agent-eyebrow">SCHEMEGUARD AI</p>
                            <h1>MY AGENT</h1>
                            <p>Ask about your transactions, qualification, fees, and anomalies.</p>
                        </div>
                    </header>

                    <section className="my-agent-chat" aria-label="Chat with MY AGENT">
                        {activeConversation?.messages.length === 0 ? (
                            <div className="my-agent-empty">
                                <RobotOutlined />
                                <h2>What would you like to know?</h2>
                                <p>Choose an upload on the right, or start by browsing your transaction context.</p>
                                <SuggestionButtons onChoose={chooseSuggestion} />
                            </div>
                        ) : (
                            <div className="my-agent-messages" aria-live="polite">
                                {activeConversation?.messages.map((message, index) => {
                                    const isStreaming = streamingMessage?.conversationId === activeConversation.id
                                        && streamingMessage.messageIndex === index;
                                    const visibleContent = isStreaming
                                        ? message.content.slice(0, streamingMessage.visibleLength)
                                        : message.content;
                                    return (
                                        <article className={`my-agent-message ${message.role}`} key={`${activeConversation.id}-${index}`}>
                                            <strong>{message.role === "assistant" ? "MY AGENT" : "You"}</strong>
                                            <p>{visibleContent}{isStreaming && <span className="my-agent-typing-caret" aria-hidden="true" />}</p>
                                            {message.role === "assistant" && message.invalid && (
                                                <div className="my-agent-invalid-options">
                                                    <span>Try one of these questions</span>
                                                    <SuggestionButtons onChoose={chooseSuggestion} />
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                                {sendingConversationId === activeConversation?.id && (
                                    <article className="my-agent-message assistant my-agent-thinking">
                                        <strong>MY AGENT</strong><p>Looking through your context<span>…</span></p>
                                    </article>
                                )}
                                <div ref={endRef} />
                            </div>
                        )}
                        {requestError?.conversationId === activeConversation?.id && (
                            <div className="my-agent-error" role="alert">{requestError.message}</div>
                        )}
                        <div className="my-agent-composer-context" aria-label="Selected context">
                            <span className="my-agent-context-caption">Context</span>
                            {!activeConversation?.uploadId ? (
                                <span className="my-agent-context-chip muted">No context</span>
                            ) : (
                                <>
                                    <span className="my-agent-context-chip upload">
                                        <span title={uploads.find((upload) => upload.id === activeConversation.uploadId)?.fileName}>
                                            {uploads.find((upload) => upload.id === activeConversation.uploadId)?.fileName ?? "Selected upload"}
                                        </span>
                                        <button type="button" aria-label="Remove upload from context" disabled={isBusy} onClick={() => changeUpload(null)}>×</button>
                                    </span>
                                    {activeConversation.selectedTransactions.map((transaction) => (
                                        <span className="my-agent-context-chip transaction" key={transaction.id}>
                                            <span>{transaction.externalId} · {qualificationBadge(transaction.qualificationStatus)}</span>
                                            <button type="button" aria-label={`Remove ${transaction.externalId} from context`} disabled={isBusy} onClick={() => removeTransaction(transaction.id)}>×</button>
                                        </span>
                                    ))}
                                </>
                            )}
                        </div>
                        <form className="my-agent-composer" onSubmit={submit}>
                            <Input.TextArea
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void submit(event as unknown as FormEvent); } }}
                                placeholder={activeConversation?.uploadId ? "Ask about the selected upload…" : "Choose an upload to add transaction context"}
                                autoSize={{ minRows: 1, maxRows: 5 }}
                                maxLength={2000}
                                aria-label="Message MY AGENT"
                                disabled={isBusy}
                            />
                            <Button type="primary" htmlType="submit" icon={<SendOutlined />} aria-label="Send message" disabled={!prompt.trim() || isBusy} loading={sendingConversationId !== null} />
                        </form>
                    </section>
                </section>

                <aside className="my-agent-context" aria-label="Transaction context">
                    <div className="my-agent-panel-heading">
                        <div><p className="my-agent-eyebrow">CONTEXT</p><h2>Transaction context</h2></div>
                    </div>
                    <label htmlFor="agent-upload">Browse uploads</label>
                    <Select
                        id="agent-upload"
                        className="my-agent-upload-select"
                        value={activeConversation?.uploadId ?? ""}
                        loading={loadingUploads}
                        disabled={isBusy || loadingUploads}
                        placeholder="No context"
                        onChange={(value: string) => changeUpload(value || null)}
                        options={[
                            { value: "", label: "No context" },
                            ...uploads.map((upload) => ({ value: upload.id, label: `${upload.fileName} · ${upload.transactionCount}` })),
                        ]}
                        notFoundContent={loadingUploads ? "Loading uploads…" : "No uploads yet"}
                        aria-label="Choose an upload for transaction context"
                    />

                    {activeConversation?.uploadId ? (
                        <>
                            <div className="my-agent-transaction-list-heading">
                                <strong>Transactions</strong>
                                <span>{activeConversation.selectedTransactions.length} / 2 selected</span>
                            </div>
                            <p className="my-agent-context-hint">Add up to two transactions from this upload.</p>
                            <Input
                                className="my-agent-transaction-search"
                                value={transactionSearch}
                                onChange={(event) => {
                                    setTransactionSearch(event.target.value);
                                    setTransactionPage(0);
                                }}
                                allowClear
                                placeholder="Search transaction IDs"
                                aria-label="Search upload transactions"
                            />
                            <div className="my-agent-transaction-list" aria-label="Upload transactions">
                                {loadingTransactions ? (
                                    <div className="my-agent-context-loading"><Spin size="small" /><span>Loading transactions…</span></div>
                                ) : contextError ? (
                                    <div className="my-agent-context-error" role="alert">{contextError}</div>
                                ) : transactions.length === 0 ? (
                                    <p className="my-agent-context-empty">{transactionSearch.trim() ? "No matching transactions." : "No transactions in this upload."}</p>
                                ) : transactions.map((transaction) => {
                                    const selected = activeConversation.selectedTransactions.some((item) => item.id === transaction.id);
                                    return (
                                        <div className="my-agent-transaction-row" key={transaction.id}>
                                            <span className={`my-agent-qualification ${qualificationBadge(transaction.qualificationStatus) === "Q" ? "qualified" : "not-qualified"}`}>
                                                {qualificationBadge(transaction.qualificationStatus)}
                                            </span>
                                            <span className="my-agent-transaction-id" title={transaction.externalId}>{transaction.externalId}</span>
                                            <button
                                                type="button"
                                                className="my-agent-add-transaction"
                                                aria-label={`${selected ? "Remove" : "Add"} ${transaction.externalId} ${selected ? "from" : "to"} context`}
                                                disabled={isBusy || (!selected && activeConversation.selectedTransactions.length >= 2)}
                                                onClick={() => selected ? removeTransaction(transaction.id) : addTransaction(transaction)}
                                            >
                                                {selected ? "−" : "+"}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            {transactionTotalPages > 1 && (
                                <div className="my-agent-transaction-pagination">
                                    <button type="button" disabled={transactionPage === 0 || loadingTransactions} onClick={() => setTransactionPage((page) => Math.max(0, page - 1))}>Previous</button>
                                    <span>{transactionPage + 1} / {transactionTotalPages}</span>
                                    <button type="button" disabled={transactionPage + 1 >= transactionTotalPages || loadingTransactions} onClick={() => setTransactionPage((page) => Math.min(transactionTotalPages - 1, page + 1))}>Next</button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="my-agent-no-context">
                            <p>No upload selected.</p>
                            <span>Choose an upload to browse its transactions. Nothing is sent to MY AGENT until you select context.</span>
                        </div>
                    )}
                    {contextError && !activeConversation?.uploadId && <div className="my-agent-context-error" role="alert">{contextError}</div>}
                </aside>
            </section>
        </main>
    );
}

function SuggestionButtons({ onChoose }: { onChoose: (question: string) => void }) {
    return (
        <div className="my-agent-suggestions">
            {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => onChoose(suggestion)}>{suggestion}</button>
            ))}
        </div>
    );
}
