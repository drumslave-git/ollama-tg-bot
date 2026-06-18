import type { ModuleDbHost } from "@llm-tg-bot/modules-registry";
import { buildMoodPayload } from "../dashboard/payloads.js";
import { compressHistoryForChat } from "../debug/context-compress.js";
import { getSettings, updateSettings, type Settings } from "../db/index.js";
import { getHistoryLimits } from "../settings/limits.js";
import { getResolvedSettings } from "../settings/runtime.js";

export function buildModuleDbHost(): ModuleDbHost {
  return {
    getSettings: () => getSettings() as unknown as Record<string, unknown>,
    updateSettings: (partial) =>
      updateSettings(partial as Partial<Settings>) as unknown as Record<
        string,
        unknown
      >,
    buildMoodPayload: () => buildMoodPayload(),
    getHistoryLimits: () => getHistoryLimits(getResolvedSettings()),
    compressHistoryChat: (chatKey, options) =>
      compressHistoryForChat(chatKey, options),
  };
}
