import { FormEvent, useEffect, useRef, useState } from "react";
import type { Transaction } from "../../../shared/types/transaction";
import { askRecommendationAgent } from "../api/recommendationApi";

interface RecommendationAssistantProps {
    transactions: Transaction[];
    isOpen: boolean;
    onClose: () => void;
}

interface ChatMessage {
    role: "assistant" | "user";
    content: string;
}

const welcomeMessage = "Select an evaluated transaction, then ask me what could be improved to reduce the fee.";

export function RecommendationAssistant({ transactions, isOpen, onClose }: RecommendationAssistantProps) {
    const [selectedTransactionId, setSelectedTransactionId] = useState("");
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: welcomeMessage }]);
    const endRef = useRef<HTMLDivElement | null>(null);
    const evaluatedTransactions = transactions.filter((transaction) => transaction.qualificationStatus && transaction.qualificationStatus !== "PENDING" && transaction.qualificationStatus !== "UNKNOWN");
    const selectedTransaction = evaluatedTransactions.find((transaction) => transaction.id === selectedTransactionId) ?? null;

    useEffect(() => {
        if (!selectedTransactionId && evaluatedTransactions.length > 0) setSelectedTransactionId(evaluatedTransactions[0].id);
        if (selectedTransactionId && !evaluatedTransactions.some((transaction) => transaction.id === selectedTransactionId)) setSelectedTransactionId("");
    }, [selectedTransactionId, evaluatedTransactions]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isOpen]);

    const selectTransaction = (transactionId: string) => {
        setSelectedTransactionId(transactionId);
        setError(null);
        const transaction = evaluatedTransactions.find((item) => item.id === transactionId);
        setMessages([{ role: "assistant", content: transaction ? `Selected transaction: ${transaction.externalId}. What would you like to improve?` : welcomeMessage }]);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const trimmedMessage = message.trim();
        if (!trimmedMessage || !selectedTransaction || isSending) return;

        setMessages((current) => [...current, { role: "user", content: trimmedMessage }]);
        setMessage("");
        setError(null);
        setIsSending(true);
        try {
            const response = await askRecommendationAgent(selectedTransaction.id, trimmedMessage);
            setMessages((current) => [...current, { role: "assistant", content: response.message }]);
        } catch (requestError: unknown) {
            setError(requestError instanceof Error ? requestError.message : "The assistant could not generate a recommendation.");
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen) return null;

    return (
        <aside className="recommendation-assistant is-open">
            <section className="assistant-panel" aria-label="Recommendation assistant">
                <header className="assistant-header">
                    <div><strong>AI recommendations</strong><small>Suggestions for reducing transaction fees</small></div>
                    <button type="button" className="assistant-close" onClick={onClose} aria-label="Close assistant">×</button>
                </header>
                <div className="assistant-context">
                    <label htmlFor="assistant-transaction">Transaction</label>
                    <select id="assistant-transaction" value={selectedTransactionId} onChange={(event) => selectTransaction(event.target.value)} disabled={!evaluatedTransactions.length}>
                        {!evaluatedTransactions.length && <option value="">No evaluated transactions available</option>}
                        {evaluatedTransactions.map((transaction) => <option key={transaction.id} value={transaction.id}>{transaction.externalId} · {transaction.qualificationStatus}</option>)}
                    </select>
                </div>
                <div className="assistant-messages" aria-live="polite">
                    {messages.map((chatMessage, index) => <div className={`assistant-message ${chatMessage.role}`} key={`${chatMessage.role}-${index}`}>{chatMessage.content}</div>)}
                    {isSending && <div className="assistant-message assistant">Analyzing the transaction...</div>}
                    {error && <div className="assistant-error">{error}</div>}
                    <div ref={endRef} />
                </div>
                <form className="assistant-form" onSubmit={submit}>
                    <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={evaluatedTransactions.length ? "E.g. What could be improved?" : "Evaluate transactions first"} disabled={!selectedTransaction || isSending} aria-label="Ask recommendation assistant" />
                    <button type="submit" disabled={!selectedTransaction || !message.trim() || isSending}>Send</button>
                </form>
            </section>
        </aside>
    );
}
