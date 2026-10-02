import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getAllUploadTransactions } from "../../uploads/api/uploadsApi";
import { askRecommendationAgent } from "../api/recommendationApi";
import type { Transaction } from "../../../shared/types/transaction";

interface RecommendationAssistantProps {
    uploadId: string | null;
    fileName?: string | null;
    isOpen: boolean;
    onClose: () => void;
}

interface ChatMessage {
    role: "assistant" | "user";
    content: string;
}

const welcomeMessage =
    "Select an evaluated transaction from this CSV file, then ask me about its qualification or fee.";

const evaluatedStatuses = new Set([
    "QUALIFIED",
    "NOT_QUALIFIED",
    "PARTIALLY_QUALIFIED"
]);

export function RecommendationAssistant({
    uploadId,
    fileName,
    isOpen,
    onClose
}: RecommendationAssistantProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [selectedTransactionId, setSelectedTransactionId] = useState("");
    const [message, setMessage] = useState("");
    const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: "assistant", content: welcomeMessage }
    ]);
    const endRef = useRef<HTMLDivElement | null>(null);

    const evaluatedTransactions = useMemo(
        () => transactions.filter((transaction) =>
            evaluatedStatuses.has(transaction.qualificationStatus)
        ),
        [transactions]
    );

    const selectedTransaction = evaluatedTransactions.find(
        (transaction) => transaction.id === selectedTransactionId
    ) ?? null;

    useEffect(() => {
        if (!isOpen || !uploadId) {
            return;
        }

        const controller = new AbortController();
        setIsLoadingTransactions(true);
        setError(null);
        setSelectedTransactionId("");
        setTransactions([]);
        setMessages([{ role: "assistant", content: welcomeMessage }]);

        void getAllUploadTransactions(uploadId, controller.signal)
            .then((loadedTransactions) => {
                setTransactions(loadedTransactions);
                const evaluated = loadedTransactions.filter((transaction) =>
                    evaluatedStatuses.has(transaction.qualificationStatus)
                );
                if (evaluated.length > 0) {
                    setSelectedTransactionId(evaluated[0].id);
                }
            })
            .catch((requestError: unknown) => {
                if (!controller.signal.aborted) {
                    setError(
                        requestError instanceof Error
                            ? requestError.message
                            : "Could not load transactions for this CSV file."
                    );
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoadingTransactions(false);
                }
            });

        return () => controller.abort();
    }, [isOpen, uploadId]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isOpen]);

    const selectTransaction = (transactionId: string) => {
        setSelectedTransactionId(transactionId);
        setError(null);
        const transaction = evaluatedTransactions.find(
            (item) => item.id === transactionId
        );
        setMessages([
            {
                role: "assistant",
                content: transaction
                    ? `Selected ${transaction.externalId} (${transaction.qualificationStatus}). What would you like to know?`
                    : welcomeMessage
            }
        ]);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmedMessage = message.trim();
        if (!uploadId || !trimmedMessage || !selectedTransaction || isSending) {
            return;
        }

        setMessages((current) => [
            ...current,
            { role: "user", content: trimmedMessage }
        ]);
        setMessage("");
        setError(null);
        setIsSending(true);

        try {
            const response = await askRecommendationAgent(
                uploadId,
                selectedTransaction.id,
                trimmedMessage
            );
            setMessages((current) => [
                ...current,
                { role: "assistant", content: response.message }
            ]);
        } catch (requestError: unknown) {
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "The assistant could not generate a recommendation."
            );
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen) {
        return null;
    }

    const canAsk = Boolean(selectedTransaction) && !isLoadingTransactions;

    return (
        <aside className="recommendation-assistant is-open">
            <section className="assistant-panel" aria-label="Recommendation assistant">
                <header className="assistant-header">
                    <div>
                        <strong>AI recommendations</strong>
                        <small>{fileName ?? "Current CSV file"}</small>
                    </div>
                    <button
                        type="button"
                        className="assistant-close"
                        onClick={onClose}
                        aria-label="Close assistant"
                    >
                        ×
                    </button>
                </header>

                <div className="assistant-context">
                    <label htmlFor="assistant-transaction">Transaction</label>
                    <select
                        id="assistant-transaction"
                        value={selectedTransactionId}
                        onChange={(event) => selectTransaction(event.target.value)}
                        disabled={isLoadingTransactions || !evaluatedTransactions.length}
                    >
                        {isLoadingTransactions && (
                            <option value="">Loading transactions...</option>
                        )}
                        {!isLoadingTransactions && !evaluatedTransactions.length && (
                            <option value="">Evaluate this CSV first</option>
                        )}
                        {evaluatedTransactions.map((transaction) => (
                            <option key={transaction.id} value={transaction.id}>
                                {transaction.externalId} · {transaction.qualificationStatus}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="assistant-messages" aria-live="polite">
                    {messages.map((chatMessage, index) => (
                        <div
                            className={`assistant-message ${chatMessage.role}`}
                            key={`${chatMessage.role}-${index}`}
                        >
                            {chatMessage.content}
                        </div>
                    ))}
                    {!isLoadingTransactions && !evaluatedTransactions.length && (
                        <div className="assistant-message assistant">
                            Evaluate this CSV file before asking transaction questions.
                        </div>
                    )}
                    {isSending && (
                        <div className="assistant-message assistant">
                            Analyzing the transaction...
                        </div>
                    )}
                    {error && <div className="assistant-error">{error}</div>}
                    <div ref={endRef} />
                </div>

                <form className="assistant-form" onSubmit={submit}>
                    <input
                        value={message}
                        maxLength={2000}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder={canAsk ? "Ask about this transaction..." : "Evaluate this CSV first"}
                        disabled={!canAsk || isSending}
                        aria-label="Ask recommendation assistant"
                    />
                    <button
                        type="submit"
                        disabled={!canAsk || !message.trim() || isSending}
                    >
                        Send
                    </button>
                </form>
            </section>
        </aside>
    );
}
