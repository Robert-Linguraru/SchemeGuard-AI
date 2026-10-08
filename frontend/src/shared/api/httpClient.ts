import { getAccessToken } from "../storage/authStorage";
import { ApiError, type FieldErrors } from "./ApiError";

interface ApiErrorResponse {
    message?: string;
    detail?: string;
    title?: string;
    errorCode?: string;
    code?: string;
    fieldErrors?: FieldErrors;
}

export interface HttpRequestOptions extends RequestInit {
    authenticated?: boolean;
}

export interface BlobResponseHandler {
    onResponse?: (response: Response) => void;
}

export const isAbortError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === "AbortError"
    || error instanceof Error && error.name === "AbortError";

const parseResponse = async (response: Response): Promise<unknown> => {
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json") && !contentType.includes("+json")) {
        return null;
    }

    return response.json().catch(() => null);
};

export const request = async <T>(
    url: string,
    options: HttpRequestOptions = {}
): Promise<T> => {
    const { authenticated = true, headers, body, ...requestOptions } = options;
    const token = authenticated ? getAccessToken() : null;
    const requestHeaders = new Headers(headers);

    if (body !== undefined && !requestHeaders.has("Content-Type")) {
        requestHeaders.set("Content-Type", "application/json");
    }

    if (token) {
        requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    let response: Response;
    try {
        response = await fetch(url, {
            ...requestOptions,
            body,
            headers: requestHeaders
        });
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }
        throw new ApiError(
            error instanceof Error ? error.message : "Network request failed"
        );
    }
    const data = await parseResponse(response);

    if (!response.ok) {
        const errorData = data as ApiErrorResponse | null;
        throw new ApiError(
            errorData?.message
                || errorData?.detail
                || errorData?.title
                || `Request failed (${response.status})`,
            response.status,
            errorData?.errorCode || errorData?.code,
            errorData?.fieldErrors
        );
    }

    return data as T;
};

export const requestBlob = async (
    url: string,
    options: HttpRequestOptions = {},
    handlers: BlobResponseHandler = {}
): Promise<Blob> => {
    const { authenticated = true, headers, body, ...requestOptions } = options;
    const token = authenticated ? getAccessToken() : null;
    const requestHeaders = new Headers(headers);

    if (body !== undefined && !requestHeaders.has("Content-Type")) {
        requestHeaders.set("Content-Type", "application/json");
    }

    if (token) {
        requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    let response: Response;
    try {
        response = await fetch(url, {
            ...requestOptions,
            body,
            headers: requestHeaders
        });
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }
        throw new ApiError(
            error instanceof Error ? error.message : "Network request failed"
        );
    }

    handlers.onResponse?.(response);

    if (!response.ok) {
        const data = await parseResponse(response);
        const errorData = data as ApiErrorResponse | null;
        throw new ApiError(
            errorData?.message || "Request failed",
            response.status,
            errorData?.errorCode || errorData?.code,
            errorData?.fieldErrors
        );
    }

    return response.blob();
};
