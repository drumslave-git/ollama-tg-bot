import type {
  DataTableConfig,
  ModuleDbExports,
  ModuleDbHost,
  SqlDatabase,
} from "../../../contracts/index.js";
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
            FROM personalities ORDER BY id ASC LIMIT $1`,
    countQuery: "SELECT COUNT(*)::int AS n FROM personalities",
    timeColumns: ["created_at", "updated_at"],
  },
};

export async function bindModuleDatabase(database: SqlDatabase): Promise<void> {
  await bindPersonalitiesDatabase(database);
  bindMoodDatabase(database);
}

export function configureModuleAccess(host: ModuleDbHost): void {
  configurePersonalityAccess(async () => ({
    activePersonalityId: Number(
      (await host.getSettings()).activePersonalityId ?? 0,
    ),
  }));
  configureMoodAccess(async () => ({
    moodCooldownMinutes: Number(
      (await host.getSettings()).moodCooldownMinutes ?? 120,
    ),
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
