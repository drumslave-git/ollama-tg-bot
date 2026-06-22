import type { ModuleDbExports } from "../contracts/index.js";
import type { McpToolRegistrar } from "../shared/index.js";
import { moodEvaluationDbModule } from "../features/mood/db/index.js";
import { historyDbModule } from "../features/history/db/index.js";
import { visionDbModule } from "../features/vision/db/index.js";
import { memoryDbModule } from "../features/memory/db/index.js";
import { registerMcpTools as registerLinkFetchTools } from "../features/link-fetch/register-mcp-tools.js";
import { registerMcpTools as registerWebSearchTools } from "../features/web-search/register-mcp-tools.js";

/**
 * Static registry of feature modules. Replaces the former manifest.json
 * discovery + dynamic `await import(packageName)` wiring: every module now
 * lives under `server/src/features/<name>` and is referenced directly.
 */
export interface ModuleEntry {
  id: string;
  name: string;
  description: string;
  apiBasePath?: string;
  settingsKeys?: string[];
  dataTables?: string[];
  dashboard?: { label: string; description: string };
  hasUi?: boolean;
  /** SQLite tables + REST routes (former `<name>/db` package). */
  db?: ModuleDbExports;
  /** In-process MCP tool registration (former `mcpTools` manifest block). */
  mcpTools?: {
    workflowStepId: string;
    toolNames: string[];
    registrar: McpToolRegistrar;
  };
}

export const MODULE_REGISTRY: ModuleEntry[] = [
  {
    id: "addressing-detection",
    name: "Address detection",
    description:
      "LLM side pass to detect when the bot is addressed by name variant in groups.",
  },
  {
    id: "completions",
    name: "Chat completions",
    description: "System prompt injection and main LLM reply generation.",
  },
  {
    id: "history",
    name: "Chat history",
    description:
      "Per-chat message storage, formatting, compression, and prompt injection.",
    apiBasePath: "/history",
    dataTables: ["chat_history"],
    dashboard: {
      label: "History",
      description: "Browse stored chat transcripts per Telegram chat.",
    },
    hasUi: true,
    db: historyDbModule,
  },
  {
    id: "link-fetch",
    name: "Link fetch",
    description:
      "Fetch linked pages on demand via the fetch_link MCP tool during the main reply.",
    mcpTools: {
      workflowStepId: "links",
      toolNames: ["fetch_link"],
      registrar: registerLinkFetchTools,
    },
  },
  {
    id: "memory",
    name: "Memory",
    description:
      "Per-user, per-group, and general fact extraction, storage, and prompt injection.",
    apiBasePath: "/memories",
    dataTables: ["user_memories", "group_memories", "general_facts"],
    dashboard: {
      label: "Memory",
      description: "View and edit stored facts per user, group, and globally.",
    },
    hasUi: true,
    db: memoryDbModule,
  },
  {
    id: "mood-evaluation",
    name: "Mood",
    description:
      "Mood evaluation side pass, personality mood defaults, and runtime mood state.",
    apiBasePath: "/mood",
    settingsKeys: ["moodCooldownMinutes", "activePersonalityId"],
    dataTables: ["personalities"],
    dashboard: {
      label: "Mood",
      description: "Global mood state, cooldown, and personality mood defaults.",
    },
    hasUi: true,
    db: moodEvaluationDbModule,
  },
  {
    id: "sticker-selection",
    name: "Sticker selection",
    description:
      "LLM pass to pick a sticker from a configured Telegram sticker set.",
    settingsKeys: ["stickersEnabled", "stickerPackName", "stickerReplyChance"],
    dashboard: {
      label: "Stickers",
      description:
        "Enable sticker replies, set frequency, and manage the Telegram sticker pack.",
    },
    hasUi: true,
  },
  {
    id: "vision",
    name: "Vision",
    description:
      "Recognize photos, image documents, and stickers via a vision model for chat history and context.",
    apiBasePath: "/vision",
    dataTables: [],
    dashboard: {
      label: "Vision",
      description: "Vision backfill and module settings.",
    },
    hasUi: true,
    db: visionDbModule,
  },
  {
    id: "web-search",
    name: "Web search",
    description:
      "Search the web on demand via the search_web MCP tool during the main reply.",
    mcpTools: {
      workflowStepId: "search",
      toolNames: ["search_web"],
      registrar: registerWebSearchTools,
    },
  },
];
