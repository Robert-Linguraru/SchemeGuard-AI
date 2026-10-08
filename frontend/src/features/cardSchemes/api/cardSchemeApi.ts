import { request } from "../../../shared/api/httpClient";
import type {
    EntityListQuery,
    EntityListResponse
} from "../../../shared/types/list";
import type {
    CardScheme,
    CardSchemeListApiResponse,
    CardSchemeMutationResponse
} from "../types/cardScheme";

const buildListUrl = (query: EntityListQuery) => {
    const params = new URLSearchParams({
        page: String(query.page),
        size: String(query.size),
        sort: query.sort || "name,asc"
    });

    if (query.search.trim()) {
        params.set("search", query.search.trim());
    }

    if (query.includeInactive === true) {
        params.set("includeInactive", "true");
    }

    return `/api/card-schemes?${params.toString()}`;
};

export const getCardSchemes = (
    query: EntityListQuery,
    signal?: AbortSignal
): Promise<EntityListResponse<CardScheme>> =>
    request<CardSchemeListApiResponse>(buildListUrl(query), {
        method: "GET",
        signal
    }).then((response) => ({
        items: response.cardSchemes,
        page: response.page,
        size: response.size,
        totalElements: response.totalElements,
        totalPages: response.totalPages
    }));

export const getAllActiveCardSchemes = async (
    signal?: AbortSignal
): Promise<CardScheme[]> => {
    const firstPage = await getCardSchemes({
        page: 0,
        size: 100,
        search: "",
        sort: "name,asc",
        includeInactive: false
    }, signal);

    if (firstPage.totalPages <= 1) {
        return firstPage.items;
    }

    const remainingPages = await Promise.all(
        Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
            getCardSchemes({
                page: index + 1,
                size: 100,
                search: "",
                sort: "name,asc",
                includeInactive: false
            }, signal)
        )
    );

    return [firstPage, ...remainingPages].flatMap((page) => page.items);
};

export const getCardScheme = (
    id: string,
    includeInactive = false,
    signal?: AbortSignal
): Promise<CardScheme> => {
    const query = includeInactive ? "?includeInactive=true" : "";

    return request<{ cardScheme: CardScheme }>(
        `/api/card-schemes/${encodeURIComponent(id)}${query}`,
        { method: "GET", signal }
    ).then((response) => response.cardScheme);
};

export const createCardScheme = (
    payload: { code: string; name: string }
): Promise<CardScheme> =>
    request<CardSchemeMutationResponse>("/api/card-schemes", {
        method: "POST",
        body: JSON.stringify(payload)
    }).then((response) => response.cardScheme);

export const updateCardScheme = (
    id: string,
    payload: { code: string; name: string }
): Promise<CardScheme> =>
    request<CardSchemeMutationResponse>(
        `/api/card-schemes/${encodeURIComponent(id)}`,
        {
            method: "PATCH",
            body: JSON.stringify(payload)
        }
    ).then((response) => response.cardScheme);

export const activateCardScheme = (
    id: string,
    cascade: boolean
): Promise<void> =>
    request<void>(
        `/api/card-schemes/${encodeURIComponent(id)}/activate`,
        {
            method: "PATCH",
            body: JSON.stringify({ cascade })
        }
    );

export const deactivateCardScheme = (id: string): Promise<void> =>
    request<void>(
        `/api/card-schemes/${encodeURIComponent(id)}/deactivate`,
        { method: "PATCH" }
    );

export const deleteCardScheme = (id: string): Promise<void> =>
    request<void>(
        `/api/card-schemes/${encodeURIComponent(id)}`,
        { method: "DELETE" }
    );
