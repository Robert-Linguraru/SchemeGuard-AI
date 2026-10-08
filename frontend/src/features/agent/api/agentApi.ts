import { request } from "../../../shared/api/httpClient";

export interface AgentTurn {
    role: "user" | "assistant";
    content: string;
}

export const chatWithAgent = (
    message: string,
    uploadId: string | null,
    transactionIds: string[],
    history: AgentTurn[]
): Promise<{ message: string; validQuestion: boolean }> => request("/api/agent/chat", {
    method: "POST",
    body: JSON.stringify({ message, uploadId, transactionIds, history })
});
