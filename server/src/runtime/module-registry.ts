import type { ModuleDbExports } from "../contracts/index.js";
import type { McpToolRegistrar } from "../shared/index.js";
import { moodEvaluationDbModule } from "../features/mood/db/index.js";
import { historyDbModule } from "../features/history/db/index.js";
import { visionDbModule } from "../features/vision/db/index.js";
import { memoryDbModule } from "../features/memory/db/index.js";
import { registerMcpTools as registerLinkFetchTools } from "../features/link-fetch/register-mcp-tools.js";
import { registerMcpTools as registerWebSearchTools } from "../features/web-search/register-mcp-tools.js";
import { registerMcpTools as registerHistoryTools } from "../features/history/register-mcp-tools.js";
import { HISTORY_TOOL_NAMES } from "../features/history/mcp-tools.js";
import { registerMcpTools as registerMemoryTools } from "../features/memory/register-mcp-tools.js";
import { MEMORY_TOOL_NAMES } from "../features/memory/mcp-tools.js";
import { tasksDbModule } from "../features/tasks/db/index.js";
import { registerMcpTools as registerTasksTools } from "../features/tasks/register-mcp-tools.js";
import { TASKS_TOOL_NAMES } from "../features/tasks/mcp-tools.js";

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
    /** Always exposed to the model, regardless of enabled workflow steps. */
    alwaysOn?: boolean;
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
      "Per-chat verbatim message storage exposed to the model through always-on history MCP tools.",
    dataTables: ["chat_messages"],
    dashboard: {
      label: "History",
      description: "Browse stored chat transcripts per Telegram chat.",
    },
    hasUi: true,
    db: historyDbModule,
    mcpTools: {
      // Always on — not gated by a workflow step. workflowStepId is unused
      // for always-on tools but kept for the registry shape.
      workflowStepId: "history",
      toolNames: HISTORY_TOOL_NAMES,
      registrar: registerHistoryTools,
      alwaysOn: true,
    },
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
    mcpTools: {
      // Always on — the model reads and writes long-term memory on demand.
      workflowStepId: "memory",
      toolNames: MEMORY_TOOL_NAMES,
      registrar: registerMemoryTools,
      alwaysOn: true,
    },
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
    id: "tasks",
    name: "Tasks",
    description:
      "Owner-managed scheduled jobs that post an in-character message into a chat at a wall-clock time (once, daily, or on weekdays).",
    apiBasePath: "/tasks",
    dataTables: ["tasks", "task_messages", "task_events"],
    dashboard: {
      label: "Tasks",
      description: "View and manage scheduled tasks per chat.",
    },
    hasUi: true,
    db: tasksDbModule,
    mcpTools: {
      // Always on — owner-gated at call time via per-turn context.
      workflowStepId: "tasks",
      toolNames: TASKS_TOOL_NAMES,
      registrar: registerTasksTools,
      alwaysOn: true,
    },
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
