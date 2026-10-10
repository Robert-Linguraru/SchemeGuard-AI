import { useSyncExternalStore } from "react";

let evaluatingUploadIds: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const getSnapshot = () => evaluatingUploadIds;

export function setUploadEvaluationInProgress(uploadId: string, isEvaluating: boolean): void {
    if (evaluatingUploadIds.has(uploadId) === isEvaluating) return;
    const next = new Set(evaluatingUploadIds);
    if (isEvaluating) next.add(uploadId);
    else next.delete(uploadId);
    evaluatingUploadIds = next;
    listeners.forEach((listener) => listener());
}

export function useUploadEvaluationIds(): ReadonlySet<string> {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useIsUploadEvaluationInProgress(uploadId: string | null | undefined): boolean {
    const ids = useUploadEvaluationIds();
    return uploadId ? ids.has(uploadId) : false;
}
