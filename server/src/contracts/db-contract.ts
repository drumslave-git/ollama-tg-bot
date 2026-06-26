import type { Router } from "express";

/** Result of a SQL query — structurally a subset of pg's `QueryResult`. */
export interface SqlQueryResult<R = Record<string, unknown>> {
  rows: R[];
  rowCount: number | null;
}

/**
 * Minimal async SQL handle used throughout the app. Backed by a `pg.Pool` in
 * production (see `db/pool.ts`); unit tests inject an in-memory fake.
 */
export interface SqlDatabase {
  query<R = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<R>>;
}

export interface DataTableConfig {
  label: string;
  columns: string[];
  query: string;
  countQuery: string;
  timeColumns?: string[];
}

export interface ModuleDbHost {
  getSettings: () => Promise<Record<string, unknown>>;
  updateSettings: (
    partial: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  buildMoodPayload?: () => Promise<unknown>;
}

export interface ModuleDbExports {
  bindModuleDatabase: (database: SqlDatabase) => void | Promise<void>;
  configureModuleAccess?: (host: ModuleDbHost) => void;
  createModuleRouter?: () => Router;
  getDataTableConfigs?: () => Record<string, DataTableConfig>;
}
