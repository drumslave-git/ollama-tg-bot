import type { DatabaseSync } from "node:sqlite";
import type {
  DataTableConfig,
  ModuleDbExports,
  ModuleDbHost,
} from "@llm-tg-bot/modules-registry";
import { bindMoodDatabase, configureMoodAccess } from "./mood.js";
import {
  bindPersonalitiesDatabase,
  configurePersonalityAccess,
} from "./personalities.js";
import { configureMoodRoutes, createMoodRouter } from "./routes.js";

export * from "./mood.js";
export * from "./personalities.js";

const DATA_TABLE_CONFIGS: Record<string, DataTableConfig> = {
  personalities: {
    label: "Personalities",
    columns: ["id", "name", "prompt", "mood_defaults", "created_at", "updated_at"],
    query: `SELECT id, name, prompt, mood_defaults, created_at, updated_at
            FROM personalities ORDER BY id ASC LIMIT ?`,
    countQuery: "SELECT COUNT(*) AS n FROM personalities",
    timeColumns: ["created_at", "updated_at"],
  },
};

export function bindModuleDatabase(database: DatabaseSync): void {
  bindPersonalitiesDatabase(database);
  bindMoodDatabase(database);
}

export function configureModuleAccess(host: ModuleDbHost): void {
  configurePersonalityAccess(() => ({
    activePersonalityId: Number(host.getSettings().activePersonalityId ?? 0),
  }));
  configureMoodAccess(() => ({
    moodCooldownMinutes: Number(host.getSettings().moodCooldownMinutes ?? 120),
  }));
  configureMoodRoutes(host);
}

export function createModuleRouter() {
  return createMoodRouter();
}

export function getDataTableConfigs(): Record<string, DataTableConfig> {
  return DATA_TABLE_CONFIGS;
}

export const moodEvaluationDbModule: ModuleDbExports = {
  bindModuleDatabase,
  configureModuleAccess,
  createModuleRouter,
  getDataTableConfigs,
};
