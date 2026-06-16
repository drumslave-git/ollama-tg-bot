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
    apiBaseUrl: "",
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
    workflowNodes: [
      { id: "message", x: 240, y: 0 },
      { id: "maintenance", x: 240, y: 110 },
      { id: "address", x: 240, y: 220 },
      { id: "mood", x: 240, y: 330 },
      { id: "link-fetch", x: 240, y: 440 },
      { id: "search", x: 240, y: 550 },
      { id: "build", x: 240, y: 660 },
      { id: "llm", x: 240, y: 770 },
      { id: "parse", x: 240, y: 880 },
      { id: "reply", x: 240, y: 990 },
      { id: "history", x: 480, y: 770 },
      { id: "memory", x: 480, y: 880 },
      { id: "sticker", x: 480, y: 990 },
    ],
    workflowEdges: [
      { id: "e-message-maintenance", source: "message", target: "maintenance" },
      { id: "e-maintenance-address", source: "maintenance", target: "address" },
      { id: "e-address-mood", source: "address", target: "mood" },
      { id: "e-mood-link", source: "mood", target: "link-fetch" },
      { id: "e-link-search", source: "link-fetch", target: "search" },
      { id: "e-search-build", source: "search", target: "build" },
      { id: "e-build-llm", source: "build", target: "llm" },
      { id: "e-llm-parse", source: "llm", target: "parse" },
      { id: "e-parse-reply", source: "parse", target: "reply" },
      { id: "e-llm-history", source: "llm", target: "history" },
      { id: "e-history-memory", source: "history", target: "memory" },
      { id: "e-parse-sticker", source: "parse", target: "sticker" },
    ],
    ...overrides,
  };
}
