import type { FeatureDbExports } from "../contracts/index.js";
import type { McpToolRegistrar } from "../shared/index.js";
import { moodEvaluationDbFeature } from "../features/mood/db/index.js";
import { historyDbFeature } from "../features/history/db/index.js";
import { visionDbFeature } from "../features/vision/db/index.js";
import { memoryDbFeature } from "../features/memory/db/index.js";
import { registerMcpTools as registerLinkFetchTools } from "../features/link-fetch/register-mcp-tools.js";
import { registerMcpTools as registerWebSearchTools } from "../features/web-search/register-mcp-tools.js";
import { registerMcpTools as registerImageGenTools } from "../features/image-gen/register-mcp-tools.js";
import { IMAGE_GEN_TOOL_NAMES } from "../features/image-gen/mcp-tools.js";
import { registerMcpTools as registerHistoryTools } from "../features/history/register-mcp-tools.js";
import { HISTORY_TOOL_NAMES } from "../features/history/mcp-tools.js";
import { registerMcpTools as registerMemoryTools } from "../features/memory/register-mcp-tools.js";
import { MEMORY_TOOL_NAMES } from "../features/memory/mcp-tools.js";
import { tasksDbFeature } from "../features/tasks/db/index.js";
import { registerMcpTools as registerTasksTools } from "../features/tasks/register-mcp-tools.js";
import { TASKS_TOOL_NAMES } from "../features/tasks/mcp-tools.js";
import { summariesDbFeature } from "../features/summaries/db/index.js";
import { registerMcpTools as registerSummariesTools } from "../features/summaries/register-mcp-tools.js";
import { SUMMARIES_TOOL_NAMES } from "../features/summaries/mcp-tools.js";

/**
 * Static registry of features. Replaces the former manifest.json
 * discovery + dynamic `await import(packageName)` wiring: every feature now
 * lives under `server/src/features/<name>` and is referenced directly.
 */
export interface FeatureEntry {
  id: string;
  name: string;
  description: string;
  apiBasePath?: string;
  settingsKeys?: string[];
  dataTables?: string[];
  /** SQLite tables + REST routes (former `<name>/db` package). */
  db?: FeatureDbExports;
  /** In-process MCP tool registration (former `mcpTools` manifest block). */
  mcpTools?: {
    workflowStepId: string;
    toolNames: string[];
    registrar: McpToolRegistrar;
    /** Always exposed to the model, regardless of enabled workflow steps. */
    alwaysOn?: boolean;
    /** When set, tools are exposed only while this settings key holds a truthy value. */
    requiresSettingKey?: string;
  };
}

export const FEATURE_REGISTRY: FeatureEntry[] = [
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
    db: historyDbFeature,
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
    id: "summaries",
    name: "History summaries",
    description:
      "Daily LLM summaries of chat history, embedded for semantic recall via the always-on history_summaries_search MCP tool.",
    apiBasePath: "/summaries",
    dataTables: ["chat_summaries"],
    db: summariesDbFeature,
    mcpTools: {
      workflowStepId: "summaries",
      toolNames: SUMMARIES_TOOL_NAMES,
      registrar: registerSummariesTools,
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
      "Durable user/group/general facts the model records as raw notes, consolidated daily into embedded records recalled via semantic memory_search.",
    apiBasePath: "/memories",
    dataTables: ["memory", "memory_entry"],
    db: memoryDbFeature,
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
    db: moodEvaluationDbFeature,
  },
  {
    id: "tasks",
    name: "Tasks",
    description:
      "Owner-managed scheduled jobs that post an in-character message into a chat at a wall-clock time (once, daily, or on weekdays).",
    apiBasePath: "/tasks",
    dataTables: ["tasks", "task_messages", "task_events"],
    db: tasksDbFeature,
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
    settingsKeys: ["stickerPackName", "stickerReplyChance"],
  },
  {
    id: "vision",
    name: "Vision",
    description:
      "Recognize photos, image documents, and stickers via a vision model for chat history and context.",
    apiBasePath: "/vision",
    dataTables: [],
    db: visionDbFeature,
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
  {
    id: "image-gen",
    name: "Image generation",
    description:
      "Generate an image on explicit request via the image_generate MCP tool and deliver it to the chat.",
    settingsKeys: ["imageModel"],
    mcpTools: {
      // Not gated by a workflow step (there is no UI to toggle those); the
      // picked image model in Settings is the on/off switch — the tool is
      // exposed only when imageModel is set.
      workflowStepId: "images",
      toolNames: IMAGE_GEN_TOOL_NAMES,
      registrar: registerImageGenTools,
      alwaysOn: true,
      requiresSettingKey: "imageModel",
    },
  },
];
