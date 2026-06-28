import type { FeatureDbHost } from "../contracts/index.js";
import { buildMoodPayload } from "../dashboard/payloads.js";
import { getSettings, updateSettings, type Settings } from "../db/index.js";

export function buildFeatureDbHost(): FeatureDbHost {
  return {
    getSettings: async () =>
      (await getSettings()) as unknown as Record<string, unknown>,
    updateSettings: async (partial) =>
      (await updateSettings(partial as Partial<Settings>)) as unknown as Record<
        string,
        unknown
      >,
    buildMoodPayload: () => buildMoodPayload(),
  };
}
