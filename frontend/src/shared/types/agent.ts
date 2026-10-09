import type { Transaction } from "./transaction";

export type AgentTransactionContext = Pick<
    Transaction,
    "id" | "externalId" | "qualificationStatus"
>;

export interface AgentOpenContext {
    requestId: number;
    uploadId: string;
    transaction: AgentTransactionContext;
}
