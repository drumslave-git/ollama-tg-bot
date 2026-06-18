import type { Settings } from "../../src/db/index.js";

/**
 * Build a valid {@link Settings} object for tests.
 *
 * Mirrors the production `DEFAULT_SETTINGS` so unit tests never need to import
 * `db/index.ts` (which pulls in `node:sqlite` and the dotenv-backed config).
 * Pass a partial override to exercise a specific field.
 */
export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    model: "gpt-4o-mini",
    activePersonalityId: 0,
    randomReplyEnabled: false,
    randomReplyChance: 5,
    reactToEveryImage: false,
    numPredict: 512,
    numCtx: 4096,
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    repeatPenalty: 1.1,
    chatTimeoutSec: 120,
    visionMaxDimension: 768,
    ownerUsername: "",
    ownerUserId: "",
    stickersEnabled: false,
    stickerPackName: "",
    stickerReplyChance: 70,
    moodCooldownMinutes: 120,
    thinkingEnabled: false,
    sendThinkingEnabled: false,
    reasoningEffort: "medium",
    maintenanceModeEnabled: false,
    workflowSteps: ["mood", "links", "search", "sticker"],
    workflowNodes: [],
    workflowEdges: [],
    ...overrides,
  };
}
