import type { ModuleDbHost } from "../contracts/index.js";
import { buildMoodPayload } from "../dashboard/payloads.js";
import { getSettings, updateSettings, type Settings } from "../db/index.js";

export function buildModuleDbHost(): ModuleDbHost {
  return {
    getSettings: () => getSettings() as unknown as Record<string, unknown>,
    updateSettings: (partial) =>
      updateSettings(partial as Partial<Settings>) as unknown as Record<
        string,
        unknown
      >,
    buildMoodPayload: () => buildMoodPayload(),
  };
}
