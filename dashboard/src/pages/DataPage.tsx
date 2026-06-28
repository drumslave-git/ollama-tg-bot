import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type DataTablePayload, type DataTableSummary } from "../api";
import { useDashboard } from "../context/DashboardContext";
import { useLiveData } from "../liveSocket";
import { ErrorBanner } from "../components/ErrorBanner";
import { Button } from "../components/ui/Button";
import { Card, Hint, Page, PageHeader } from "../components/ui/Layout";
import { cn } from "../lib/cn";

type SortDirection = "asc" | "desc";

function formatCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function cellSearchText(value: unknown): string {
  return formatCell(value).toLowerCase();
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }
  return formatCell(a).localeCompare(formatCell(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isLongColumn(column: string): boolean {
  return /content|fact|message|stack|value/i.test(column);
}

function filterRows(
  rows: Record<string, unknown>[],
  columns: string[],
  searchQuery: string,
  columnFilters: Record<string, string>,
): Record<string, unknown>[] {
  const query = searchQuery.trim().toLowerCase();
  const activeFilters = Object.entries(columnFilters).filter(
    ([, value]) => value.trim() !== "",
  );

  return rows.filter((row) => {
    if (query) {
      const matchesSearch = columns.some((column) =>
        cellSearchText(row[column]).includes(query),
      );
      if (!matchesSearch) return false;
    }

    for (const [column, filterValue] of activeFilters) {
      const needle = filterValue.trim().toLowerCase();
      if (!cellSearchText(row[column]).includes(needle)) return false;
    }

    return true;
  });
}

function sortRows(
  rows: Record<string, unknown>[],
  sortColumn: string | null,
  sortDirection: SortDirection,
): Record<string, unknown>[] {
  if (!sortColumn) return rows;
  const sorted = [...rows];
  sorted.sort((left, right) => {
    const cmp = compareValues(left[sortColumn], right[sortColumn]);
    return sortDirection === "asc" ? cmp : -cmp;
  });
  return sorted;
}

const tabButtonClass =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-transparent px-3.5 py-1.5 font-inherit text-muted hover:border-muted hover:text-text";

export function DataPage() {
  const { apiOnline } = useDashboard();
  const [tables, setTables] = useState<DataTableSummary[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [payload, setPayload] = useState<DataTablePayload | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
    {},
  );
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const loadMeta = useCallback(
    async (silent = false) => {
      if (!apiOnline) return;
      if (!silent) setLoadingMeta(true);
      setError(null);
      try {
        const data = await api.getDataTables();
        setTables(data.tables);
        setActiveTable((current) => {
          if (current && data.tables.some((t) => t.id === current)) {
            return current;
          }
          return data.tables[0]?.id ?? null;
        });
      } catch (err) {
        setError(err);
        setTables([]);
        setActiveTable(null);
      } finally {
        if (!silent) setLoadingMeta(false);
      }
    },
    [apiOnline],
  );

  const loadTable = useCallback(
    async (tableId: string, silent = false) => {
      if (!apiOnline) return;
      if (!silent) setLoadingTable(true);
      setError(null);
      try {
        const data = await api.getDataTable(tableId);
        setPayload(data);
      } catch (err) {
        setError(err);
        setPayload(null);
      } finally {
        if (!silent) setLoadingTable(false);
      }
    },
    [apiOnline],
  );

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!activeTable) {
      setPayload(null);
      return;
    }
    setSearchQuery("");
    setColumnFilters({});
    setShowColumnFilters(false);
    setSortColumn(null);
    setSortDirection("asc");
    void loadTable(activeTable);
  }, [activeTable, loadTable]);

  const refreshLive = useCallback(
    async (tableIds?: string[]) => {
      if (!apiOnline) return;
      const shouldRefreshMeta =
        !tableIds?.length ||
        tableIds.some((id) => tables.some((table) => table.id === id));
      if (shouldRefreshMeta) {
        await loadMeta(true);
      }
      if (
        activeTable &&
        (!tableIds?.length || tableIds.includes(activeTable))
      ) {
        await loadTable(activeTable, true);
      }
    },
    [apiOnline, activeTable, tables, loadMeta, loadTable],
  );

  useLiveData(
    useCallback(
      (event) => {
        void refreshLive(event.tableIds);
      },
      [refreshLive],
    ),
    apiOnline === true,
  );

  const activeSummary = tables.find((t) => t.id === activeTable);
  const isTableLoading = loadingTable;

  const displayedRows = useMemo(() => {
    if (!payload) return [];
    const filtered = filterRows(
      payload.rows,
      payload.columns,
      searchQuery,
      columnFilters,
    );
    return sortRows(filtered, sortColumn, sortDirection);
  }, [payload, searchQuery, columnFilters, sortColumn, sortDirection]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    Object.values(columnFilters).some((value) => value.trim() !== "");

  const toggleSort = (column: string) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("asc");
      return;
    }
    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }
    setSortColumn(null);
    setSortDirection("asc");
  };

  const clearFilters = () => {
    setSearchQuery("");
    setColumnFilters({});
  };

  const updateColumnFilter = (column: string, value: string) => {
    setColumnFilters((current) => {
      if (!value.trim()) {
        const next = { ...current };
        delete next[column];
        return next;
      }
      return { ...current, [column]: value };
    });
  };

  return (
    <Page>
      <PageHeader
        title="Data"
        description={
          <>
            Raw Postgres contents — one tab per table, every table in the
            database. Large tables show the newest {2000} rows. Updates live.
          </>
        }
      />

      {error != null ? (
        <ErrorBanner
          error={error}
          compact
          onRetry={() => {
            void loadMeta();
            if (activeTable) void loadTable(activeTable);
          }}
        />
      ) : null}

      {loadingMeta && tables.length === 0 ? (
        <Hint>Loading tables…</Hint>
      ) : null}

      {tables.length > 0 ? (
        <>
          <div
            className="mb-3 flex flex-wrap gap-2"
            role="tablist"
            aria-label="Database tables"
          >
            {tables.map((table) => {
              const isActive = activeTable === table.id;
              return (
                <div
                  key={table.id}
                  className={cn(
                    "inline-flex items-stretch rounded-md",
                    isActive && "shadow-[0_0_0_1px_var(--color-accent)]",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={cn(
                      tabButtonClass,
                      isActive && "border-accent bg-accent/12 text-text",
                    )}
                    onClick={() => setActiveTable(table.id)}
                  >
                    {table.label}
                    <span
                      className={cn(
                        "rounded-full bg-surface-2 px-1.5 py-0.5 text-xs text-muted",
                        isActive && "text-text",
                      )}
                    >
                      {table.count}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-base font-semibold text-text">
                {activeSummary?.label ?? "Table"}
              </h3>
              {payload ? (
                <Hint className="m-0">
                  {hasActiveFilters
                    ? `${displayedRows.length} of ${payload.rows.length} loaded row${
                        payload.rows.length === 1 ? "" : "s"
                      }`
                    : `${payload.total} row${payload.total === 1 ? "" : "s"}`}
                  {payload.truncated
                    ? ` — newest ${payload.rows.length} loaded`
                    : null}
                </Hint>
              ) : null}
            </div>

            {isTableLoading ? <Hint>Loading rows…</Hint> : null}

            {!isTableLoading && payload && payload.rows.length === 0 ? (
              <Hint>No rows in this table.</Hint>
            ) : null}

            {!isTableLoading && payload && payload.rows.length > 0 ? (
              <>
                <div className="mb-3.5 flex flex-wrap items-center gap-2">
                  <label className="mb-0 min-w-0 flex-[1_1_14rem]">
                    <span className="sr-only">Search table</span>
                    <input
                      type="search"
                      className="py-2"
                      placeholder="Search all columns…"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    className={cn(showColumnFilters && "border-accent text-accent")}
                    onClick={() => setShowColumnFilters((current) => !current)}
                  >
                    Column filters
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!hasActiveFilters}
                    onClick={clearFilters}
                  >
                    Clear
                  </Button>
                </div>

                {displayedRows.length === 0 ? (
                  <Hint>
                    No rows match the current search or filters.
                  </Hint>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full border-collapse text-[0.82rem]">
                      <thead>
                        <tr>
                          {payload.columns.map((column) => {
                            const isSorted = sortColumn === column;
                            return (
                              <th
                                key={column}
                                scope="col"
                                className="sticky top-0 border-b border-border bg-surface px-2.5 py-2 text-left align-top font-semibold whitespace-nowrap"
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    "inline-flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left font-inherit font-semibold hover:text-accent",
                                    isSorted && "text-accent",
                                  )}
                                  aria-sort={
                                    isSorted
                                      ? sortDirection === "asc"
                                        ? "ascending"
                                        : "descending"
                                      : "none"
                                  }
                                  onClick={() => toggleSort(column)}
                                >
                                  <span>{column}</span>
                                  <span
                                    className={cn(
                                      "text-[0.72rem] leading-none text-muted",
                                      isSorted && "text-accent",
                                    )}
                                    aria-hidden
                                  >
                                    {isSorted
                                      ? sortDirection === "asc"
                                        ? "↑"
                                        : "↓"
                                      : "↕"}
                                  </span>
                                </button>
                              </th>
                            );
                          })}
                        </tr>
                        {showColumnFilters ? (
                          <tr>
                            {payload.columns.map((column) => (
                              <th
                                key={column}
                                className="sticky top-9 border-b border-border bg-surface px-2.5 pt-1.5 pb-2 align-top font-normal"
                              >
                                <input
                                  type="search"
                                  className="min-w-[4.5rem] px-2 py-1.5 text-xs"
                                  placeholder="Filter…"
                                  value={columnFilters[column] ?? ""}
                                  onChange={(event) =>
                                    updateColumnFilter(
                                      column,
                                      event.target.value,
                                    )
                                  }
                                  aria-label={`Filter ${column}`}
                                />
                              </th>
                            ))}
                          </tr>
                        ) : null}
                      </thead>
                      <tbody>
                        {displayedRows.map((row, index) => (
                          <tr
                            key={index}
                            className="hover:bg-accent/6 last:[&_td]:border-b-0"
                          >
                            {payload.columns.map((column) => (
                              <td
                                key={column}
                                className={cn(
                                  "border-b border-border px-2.5 py-2 align-top text-left",
                                  isLongColumn(column) &&
                                    "min-w-48 max-w-md whitespace-pre-wrap break-words font-mono text-[0.78rem]",
                                )}
                              >
                                {formatCell(row[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </Card>
        </>
      ) : null}

      {!loadingMeta && tables.length === 0 && apiOnline && error == null ? (
        <Hint>No tables found.</Hint>
      ) : null}
    </Page>
  );
}
