import type {
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

export const moodEvaluationDbModule: ModuleDbExports = {
  bindModuleDatabase,
  configureModuleAccess,
  createModuleRouter,
};
