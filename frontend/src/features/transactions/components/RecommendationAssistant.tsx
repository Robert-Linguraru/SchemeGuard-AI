import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { askRecommendationAgent } from "../api/recommendationApi";
import type { Transaction } from "../../../shared/types/transaction";
import { Button } from "antd";

interface RecommendationAssistantProps {
    uploadId: string | null;
    fileName?: string | null;
    transactions: Transaction[];
    isLoadingTransactions: boolean;
    isOpen: boolean;
    onClose: () => void;
}

interface ChatMessage {
    role: "assistant" | "user";
    content: string;
}

const welcomeMessage =
    "Select an evaluated transaction from this page, then ask me about its qualification or fee.";

const evaluatedStatuses = new Set([
    "QUALIFIED",
    "NOT_QUALIFIED",
    "PARTIALLY_QUALIFIED"
]);

export function RecommendationAssistant({
    uploadId,
    fileName,
    transactions,
    isLoadingTransactions,
    isOpen,
    onClose
}: RecommendationAssistantProps) {
    const [selectedTransactionId, setSelectedTransactionId] = useState("");
    const [message, setMessage] = useState("");
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
        if (evaluatedTransactions.some((transaction) => transaction.id === selectedTransactionId)) {
            return;
        }

        setError(null);
        const nextTransaction = evaluatedTransactions[0];
        setSelectedTransactionId(nextTransaction?.id ?? "");
        setMessages([
            {
                role: "assistant",
                content: nextTransaction
                    ? `Selected ${nextTransaction.externalId} (${nextTransaction.qualificationStatus}). What would you like to know?`
                    : welcomeMessage
            }
        ]);
    }, [evaluatedTransactions, selectedTransactionId]);

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
                    <Button
                        type="text"
                        className="assistant-close"
                        onClick={onClose}
                        aria-label="Close assistant"
                    >
                        ×
                    </Button>
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
                            <option value="">No evaluated transactions on this page</option>
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
                            No evaluated transactions are on this page. Move to a page with evaluated transactions or evaluate this CSV first.
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
                        placeholder={canAsk ? "Ask about this transaction..." : "Select an evaluated transaction"}
                        disabled={!canAsk || isSending}
                        aria-label="Ask recommendation assistant"
                    />
                    <Button
                        type="primary"
                        htmlType="submit"
                        disabled={!canAsk || !message.trim() || isSending}
                    >
                        Send
                    </Button>
                </form>
            </section>
        </aside>
    );
}
