import { request } from "../../../shared/api/httpClient";

export const NUKE_CONFIRMATION_PHRASE = "DELETE ALL DATA";

export const executeNuke = (confirmationPhrase: string): Promise<void> =>
    request<void>("/api/admin/nuke", {
        method: "POST",
        body: JSON.stringify({ confirmationPhrase })
    });
