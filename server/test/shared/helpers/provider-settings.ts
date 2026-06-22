import type { ProviderChatSettings } from "../../../src/shared/openai-compat.js";

export function makeProviderSettings(
  overrides: Partial<ProviderChatSettings> = {},
): ProviderChatSettings {
  return {
    numCtx: 4096,
    topK: 40,
    repeatPenalty: 1.1,
    thinkingEnabled: false,
    reasoningEffort: "medium",
    ...overrides,
  };
}
