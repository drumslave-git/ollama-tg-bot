import type {
  FeatureDbExports,
  FeatureDbHost,
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

export async function bindFeatureDatabase(database: SqlDatabase): Promise<void> {
  await bindPersonalitiesDatabase(database);
  bindMoodDatabase(database);
}

export function configureFeatureAccess(host: FeatureDbHost): void {
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

export function createFeatureRouter() {
  return createMoodRouter();
}

export const moodEvaluationDbFeature: FeatureDbExports = {
  bindFeatureDatabase,
  configureFeatureAccess,
  createFeatureRouter,
};
