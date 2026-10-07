import { useEffect, Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { ErrorMessage } from "../ErrorMessage";
import { LoadingState } from "../LoadingState";
import { Button } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import { useEntityList } from "../../hooks/useEntityList";
import type { AuthenticatedUser } from "../../types/auth";
import type {
    EntityListAction,
    EntityListColumn,
    EntityListFetcher,
    EntityListResponse,
    EntityListQuery
} from "../../types/list";

export interface EntityListToolbarContext {
    query: EntityListQuery;
    updateQuery: (changes: Partial<EntityListQuery>) => void;
}

interface EntityListProps<T> {
    title: string;
    description?: string;
    columns: EntityListColumn<T>[];
    fetchData: EntityListFetcher<T>;
    actions?: EntityListAction<T>[];
    user?: AuthenticatedUser | null;
    initialQuery?: Partial<EntityListQuery>;
    reloadKey?: number;
    searchPlaceholder?: string;
    emptyMessage?: string;
    toolbar?: (context: EntityListToolbarContext) => ReactNode;
    onResponse?: (response: EntityListResponse<T>) => void;
    onLoadingChange?: (isLoading: boolean) => void;
    expandedItemId?: string | null;
    onToggleExpanded?: (item: T) => void;
    renderExpanded?: (item: T) => ReactNode;
    rowClassName?: (item: T) => string | undefined;
    expandOnRowClick?: boolean;
}

const getSortState = (sort: string) => {
    const [field, direction] = sort.split(",", 2);
    return {
        field,
        direction: direction === "desc" ? "desc" : "asc"
    } as const;
};

export function EntityList<T>({
    title,
    description,
    columns,
    fetchData,
    actions = [],
    user = null,
    initialQuery,
    reloadKey = 0,
    searchPlaceholder = "Search...",
    emptyMessage = "No records found.",
    toolbar,
    onResponse,
    onLoadingChange,
    expandedItemId = null,
    onToggleExpanded,
    renderExpanded,
    rowClassName,
    expandOnRowClick = false
}: EntityListProps<T>) {
    const {
        query,
        response,
        isLoading,
        error,
        updateQuery,
        setSearch,
        setPage,
        setPageSize,
        setSort,
        reload
    } = useEntityList({ fetchData, initialQuery, reloadKey });
    const [searchValue, setSearchValue] = useState(query.search);
    const [showTopPagination, setShowTopPagination] = useState(false);
    const listCardRef = useRef<HTMLElement>(null);
    const bottomPaginationRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSearchValue(query.search);
    }, [query.search]);

    useEffect(() => {
        if (response) {
            onResponse?.(response);
        }
    }, [onResponse, response]);

    useEffect(() => {
        onLoadingChange?.(isLoading);
    }, [isLoading, onLoadingChange]);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            if (searchValue !== query.search) {
                setSearch(searchValue);
            }
        }, 350);

        return () => window.clearTimeout(timeout);
    }, [query.search, searchValue, setSearch]);

    useEffect(() => {
        const updateTopPaginationVisibility = () => {
            const listCard = listCardRef.current;
            const bottomPagination = bottomPaginationRef.current;

            if (!listCard || !bottomPagination || !response?.items.length) {
                setShowTopPagination(false);
                return;
            }

            setShowTopPagination(
                bottomPagination.getBoundingClientRect().top >= window.innerHeight
            );
        };

        updateTopPaginationVisibility();
        window.addEventListener("resize", updateTopPaginationVisibility);
        window.addEventListener("scroll", updateTopPaginationVisibility, { passive: true });
        const resizeObserver = typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(updateTopPaginationVisibility);
        if (listCardRef.current) {
            resizeObserver?.observe(listCardRef.current);
        }

        return () => {
            window.removeEventListener("resize", updateTopPaginationVisibility);
            window.removeEventListener("scroll", updateTopPaginationVisibility);
            resizeObserver?.disconnect();
        };
    }, [isLoading, response, query.size]);

    const sortState = getSortState(query.sort);
    const visibleActionCount = useMemo(
        () => response?.items.some((item) => actions.some((action) =>
            !action.isVisible || action.isVisible(item, user)
        )),
        [actions, response?.items, user]
    );

    const toggleSort = (column: EntityListColumn<T>) => {
        if (!column.sortable) {
            return;
        }

        const field = column.sortKey || column.key;
        const direction = sortState.field === field && sortState.direction === "asc"
            ? "desc"
            : "asc";
        setSort(`${field},${direction}`);
    };

    const displayValue = (item: T, column: EntityListColumn<T>) => {
        if (column.render) {
            return column.render(item);
        }

        const value = (item as Record<string, unknown>)[column.key];
        return value === null || value === undefined || value === ""
            ? "—"
            : String(value);
    };

    const currentPage = response?.page ?? query.page;
    const totalPages = response?.totalPages ?? 0;
    const totalElements = response?.totalElements ?? 0;
    const pageSize = response?.size || query.size;
    const firstItem = totalElements === 0 ? 0 : currentPage * pageSize + 1;
    const lastItem = Math.min((currentPage + 1) * pageSize, totalElements);
    const renderPaginationControls = () => (
        <div className="entity-list-pagination-controls">
            <label>
                <span>Rows</span>
                <select
                    value={query.size}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                >
                    {[10, 20, 50, 100].map((size) => (
                        <option value={size} key={size}>{size}</option>
                    ))}
                </select>
            </label>
            <Button
                type="default"
                className="secondary-button"
                disabled={currentPage <= 0}
                onClick={() => setPage(currentPage - 1)}
            >
                Previous
            </Button>
            <span className="entity-list-page-number">
                Page {currentPage + 1} of {Math.max(totalPages, 1)}
            </span>
            <Button
                type="default"
                className="secondary-button"
                disabled={totalPages === 0 || currentPage >= totalPages - 1}
                onClick={() => setPage(currentPage + 1)}
            >
                Next
            </Button>
        </div>
    );

    return (
        <section className="entity-list-card" ref={listCardRef}>
            <div className="entity-list-heading">
                <div>
                    <p className="eyebrow">LIST VIEW</p>
                    <h2>{title}</h2>
                    {description && <p>{description}</p>}
                </div>
                <span className="record-count">
                    {totalElements} {totalElements === 1 ? "record" : "records"}
                </span>
            </div>

            <div className="entity-list-toolbar">
                <label className="entity-list-search">
                    <span>Search</span>
                    <input
                        type="search"
                        value={searchValue}
                        placeholder={searchPlaceholder}
                        onChange={(event) => setSearchValue(event.target.value)}
                    />
                </label>
                <div className={`entity-list-toolbar-extras${showTopPagination ? "" : " entity-list-toolbar-extras-no-pagination"}`}>
                    {toolbar?.({ query, updateQuery })}
                    {!isLoading && showTopPagination && response && response.items.length > 0 && (
                        <div
                            className="entity-list-pagination entity-list-pagination-top"
                        >
                            <span>
                                Showing {firstItem}-{lastItem} of {totalElements}
                            </span>
                            {renderPaginationControls()}
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="entity-list-feedback">
                    <ErrorMessage title="Unable to load records" message={error} />
                    <Button className="secondary-button" onClick={reload}>
                        Try again
                    </Button>
                </div>
            )}

            {isLoading && <LoadingState message="Loading records..." />}

            {!isLoading && !error && response?.items.length === 0 && (
                <LoadingState message={emptyMessage} />
            )}

            {!isLoading && !error && response && response.items.length > 0 && (
                <>
                    <div className="entity-list-table-container">
                        <table className="entity-list-table">
                            <thead>
                                <tr>
                                    {columns.map((column) => (
                                        <th key={column.key} scope="col" style={{ textAlign: column.align ?? "left" }}>
                                            {column.sortable ? (
                                                <Button
                                                    type="text"
                                                    className="entity-list-sort-button"
                                                    onClick={() => toggleSort(column)}
                                                >
                                                    {column.label}
                                                    <span aria-hidden="true">
                                                        {sortState.field === (column.sortKey || column.key)
                                                            ? sortState.direction === "asc" ? " ↑" : " ↓"
                                                            : " ↕"}
                                                    </span>
                                                </Button>
                                            ) : column.label}
                                        </th>
                                    ))}
                                    {renderExpanded && (
                                        <th
                                            className="entity-list-expand-heading"
                                            scope="col"
                                            aria-label={expandOnRowClick ? "Transaction details" : undefined}
                                        >
                                            {expandOnRowClick ? null : "Qualification"}
                                        </th>
                                    )}
                                    {visibleActionCount && <th scope="col">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {response.items.map((item, index) => {
                                    const rowActions = actions.filter((action) =>
                                        !action.isVisible || action.isVisible(item, user)
                                    );

                                    const itemId = (item as { id?: string }).id;
                                    const isExpanded = expandedItemId === itemId;
                                    const toggleExpanded = () => onToggleExpanded?.(item);
                                    return (
                                        <Fragment key={(item as { id?: string }).id || index}>
                                        <tr
                                            className={[
                                                renderExpanded ? `entity-list-data-row${isExpanded ? " is-expanded" : ""}${expandOnRowClick ? " is-expandable" : ""}` : undefined,
                                                rowClassName?.(item)
                                            ].filter(Boolean).join(" ") || undefined}
                                            onClick={expandOnRowClick ? (event) => {
                                                if ((event.target as HTMLElement).closest("button, a, input, select, textarea, label")) return;
                                                toggleExpanded();
                                            } : undefined}
                                            onKeyDown={expandOnRowClick ? (event) => {
                                                if (event.target !== event.currentTarget) return;
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    toggleExpanded();
                                                }
                                            } : undefined}
                                            tabIndex={expandOnRowClick ? 0 : undefined}
                                            aria-expanded={expandOnRowClick ? isExpanded : undefined}
                                        >
                                            {columns.map((column) => (
                                                <td key={column.key} style={{ textAlign: column.align ?? "left" }}>
                                                    {displayValue(item, column)}
                                                </td>
                                            ))}
                                            {renderExpanded && (
                                                <td className="entity-list-expand-cell">
                                                    <Button
                                                        type="default"
                                                        className="entity-list-expand-button"
                                                        aria-expanded={isExpanded}
                                                        aria-label={isExpanded
                                                            ? "Collapse details"
                                                            : "Expand details"}
                                                        onClick={toggleExpanded}
                                                    >
                                                        {isExpanded ? <DownOutlined /> : <RightOutlined />}
                                                    </Button>
                                                </td>
                                            )}
                                            {visibleActionCount && (
                                                <td className="entity-list-action-cell">
                                                    <div className="entity-list-actions">
                                                        {rowActions.map((action) => (
                                                            <Button
                                                                key={action.key}
                                                                type="default"
                                                                className={action.className || "entity-list-action-button"}
                                                                icon={action.icon}
                                                                danger={action.className?.includes("entity-list-action-danger")}
                                                                disabled={action.isDisabled?.(item, user)}
                                                                onClick={() => void action.onClick(item)}
                                                            >
                                                                {action.label}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                        {renderExpanded && (
                                            <tr className={`entity-list-expanded-row${isExpanded ? " is-expanded" : ""}`} aria-hidden={!isExpanded}>
                                                <td colSpan={columns.length + 1 + (visibleActionCount ? 1 : 0)}>
                                                    <div className="entity-list-expanded-transition">
                                                        <div className="entity-list-expanded-content">
                                                            {renderExpanded(item)}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="entity-list-pagination" ref={bottomPaginationRef}>
                        <span>
                            Showing {firstItem}–{lastItem} of {totalElements}
                        </span>
                        {renderPaginationControls()}
                    </div>
                </>
            )}
        </section>
    );
}
