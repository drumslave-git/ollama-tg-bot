import type { Settings } from "../../src/db/index.js";

/**
 * Build a valid {@link Settings} object for tests.
 *
 * Mirrors the production `DEFAULT_SETTINGS` so unit tests never need to import
 * `db/index.ts` (which pulls in the Postgres pool and the dotenv-backed config).
 * Pass a partial override to exercise a specific field.
 */
export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    model: "gpt-4o-mini",
    embeddingModel: "",
    imageModel: "",
    activePersonalityId: 0,
    numPredict: 512,
    numCtx: 4096,
    temperature: 0.7,
    topP: 0.9,
    chatTimeoutSec: 120,
    visionMaxDimension: 768,
    ownerUsername: "",
    ownerUserId: "",
    stickerPackName: "",
    stickerReplyChance: 70,
    moodCooldownMinutes: 120,
    thinkingEnabled: false,
    reasoningEffort: "medium",
    maintenanceModeEnabled: false,
    workflowSteps: ["mood", "links", "search", "sticker"],
    browserAgentConcurrency: 1,
    browserDownloadMaxMb: 20,
    ...overrides,
  };
}
