import type { DatabaseSync } from "node:sqlite";
import type { Router } from "express";

export interface DataTableConfig {
  label: string;
  columns: string[];
  query: string;
  countQuery: string;
  timeColumns?: string[];
}

export interface ModuleDbHost {
  getSettings: () => Record<string, unknown>;
  updateSettings: (partial: Record<string, unknown>) => Record<string, unknown>;
  buildMoodPayload?: () => unknown;
  getHistoryLimits?: () => {
    historyMaxReplyChars: number;
    historyMaxTokens: number;
  };
}

export interface ModuleDbExports {
  bindModuleDatabase: (database: DatabaseSync) => void;
  configureModuleAccess?: (host: ModuleDbHost) => void;
  createModuleRouter?: () => Router;
  getDataTableConfigs?: () => Record<string, DataTableConfig>;
}
