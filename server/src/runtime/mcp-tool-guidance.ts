import { READ_PAGE_TOOL_NAME } from "../features/link-fetch/mcp-tools.js";
import { READ_PAGE_DESCRIPTION } from "../features/link-fetch/guidance.js";
import { SEARCH_WEB_TOOL_NAME } from "../features/web-search/mcp-tools.js";
import { SEARCH_WEB_DESCRIPTION } from "../features/web-search/guidance.js";
import { BROWSE_WEB_TOOL_NAME } from "../features/web-browse/mcp-tools.js";
import { BROWSE_WEB_DESCRIPTION } from "../features/web-browse/guidance.js";
import {
  HISTORY_GET_IN_RANGE_TOOL_NAME,
  HISTORY_GET_MESSAGES_TOOL_NAME,
  HISTORY_SEARCH_TOOL_NAME,
  HISTORY_TODAY_GET_LATEST_TOOL_NAME,
  HISTORY_TODAY_SEARCH_TOOL_NAME,
} from "../features/history/mcp-tools.js";
import {
  HISTORY_GET_IN_RANGE_DESCRIPTION,
  HISTORY_GET_MESSAGES_DESCRIPTION,
  HISTORY_SEARCH_DESCRIPTION,
  HISTORY_TODAY_GET_LATEST_DESCRIPTION,
  HISTORY_TODAY_SEARCH_DESCRIPTION,
} from "../features/history/guidance.js";
import { HISTORY_SUMMARIES_SEARCH_TOOL_NAME } from "../features/summaries/mcp-tools.js";
import { HISTORY_SUMMARIES_SEARCH_DESCRIPTION } from "../features/summaries/guidance.js";
import {
  MEMORY_ENTRIES_GET_TOOL_NAME,
  MEMORY_ENTRIES_SEARCH_TOOL_NAME,
  MEMORY_GET_TOOL_NAME,
  MEMORY_SAVE_TOOL_NAME,
  MEMORY_SEARCH_TOOL_NAME,
} from "../features/memory/mcp-tools.js";
import {
  MEMORY_ENTRIES_GET_DESCRIPTION,
  MEMORY_ENTRIES_SEARCH_DESCRIPTION,
  MEMORY_GET_DESCRIPTION,
  MEMORY_SAVE_TOOL_DESCRIPTION,
  MEMORY_SEARCH_DESCRIPTION,
} from "../features/memory/guidance.js";
import {
  TASKS_CREATE_TOOL_NAME,
  TASKS_DELETE_TOOL_NAME,
  TASKS_GET_TOOL_NAME,
  TASKS_LIST_TOOL_NAME,
  TASKS_SEARCH_TOOL_NAME,
  TASKS_UPDATE_TOOL_NAME,
} from "../features/tasks/mcp-tools.js";
import {
  TASKS_CREATE_DESCRIPTION,
  TASKS_DELETE_DESCRIPTION,
  TASKS_GET_DESCRIPTION,
  TASKS_LIST_DESCRIPTION,
  TASKS_SEARCH_DESCRIPTION,
  TASKS_UPDATE_DESCRIPTION,
} from "../features/tasks/guidance.js";
import { IMAGE_GENERATE_TOOL_NAME } from "../features/image-gen/mcp-tools.js";
import { IMAGE_GENERATE_DESCRIPTION } from "../features/image-gen/guidance.js";

export interface McpToolGuidance {
  name: string;
  signature: string;
  description: string;
}

const TOOL_GUIDANCE: McpToolGuidance[] = [
  {
    name: HISTORY_TODAY_GET_LATEST_TOOL_NAME,
    signature: "(entity_id, count)",
    description: HISTORY_TODAY_GET_LATEST_DESCRIPTION,
  },
  {
    name: HISTORY_TODAY_SEARCH_TOOL_NAME,
    signature: "(entity_id, query)",
    description: HISTORY_TODAY_SEARCH_DESCRIPTION,
  },
  {
    name: HISTORY_SUMMARIES_SEARCH_TOOL_NAME,
    signature: "(entity_id, query)",
    description: HISTORY_SUMMARIES_SEARCH_DESCRIPTION,
  },
  {
    name: HISTORY_GET_MESSAGES_TOOL_NAME,
    signature: "(entity_id, message_ids)",
    description: HISTORY_GET_MESSAGES_DESCRIPTION,
  },
  {
    name: HISTORY_GET_IN_RANGE_TOOL_NAME,
    signature: "(entity_id, from, to)",
    description: HISTORY_GET_IN_RANGE_DESCRIPTION,
  },
  {
    name: HISTORY_SEARCH_TOOL_NAME,
    signature: "(entity_id, query)",
    description: HISTORY_SEARCH_DESCRIPTION,
  },
  {
    name: MEMORY_GET_TOOL_NAME,
    signature: "(type, id)",
    description: MEMORY_GET_DESCRIPTION,
  },
  {
    name: MEMORY_SEARCH_TOOL_NAME,
    signature: "(query)",
    description: MEMORY_SEARCH_DESCRIPTION,
  },
  {
    name: MEMORY_ENTRIES_SEARCH_TOOL_NAME,
    signature: "(query)",
    description: MEMORY_ENTRIES_SEARCH_DESCRIPTION,
  },
  {
    name: MEMORY_ENTRIES_GET_TOOL_NAME,
    signature: "(type, id)",
    description: MEMORY_ENTRIES_GET_DESCRIPTION,
  },
  {
    name: MEMORY_SAVE_TOOL_NAME,
    signature: "(type, id, content)",
    description: MEMORY_SAVE_TOOL_DESCRIPTION,
  },
  {
    name: TASKS_CREATE_TOOL_NAME,
    signature: "(instruction, schedule_kind, time, weekdays?, date?)",
    description: TASKS_CREATE_DESCRIPTION,
  },
  {
    name: TASKS_UPDATE_TOOL_NAME,
    signature: "(id, ...fields)",
    description: TASKS_UPDATE_DESCRIPTION,
  },
  {
    name: TASKS_DELETE_TOOL_NAME,
    signature: "(id)",
    description: TASKS_DELETE_DESCRIPTION,
  },
  {
    name: TASKS_GET_TOOL_NAME,
    signature: "(id)",
    description: TASKS_GET_DESCRIPTION,
  },
  {
    name: TASKS_LIST_TOOL_NAME,
    signature: "()",
    description: TASKS_LIST_DESCRIPTION,
  },
  {
    name: TASKS_SEARCH_TOOL_NAME,
    signature: "(query)",
    description: TASKS_SEARCH_DESCRIPTION,
  },
  {
    name: READ_PAGE_TOOL_NAME,
    signature: "(url)",
    description: READ_PAGE_DESCRIPTION,
  },
  {
    name: SEARCH_WEB_TOOL_NAME,
    signature: "(query)",
    description: SEARCH_WEB_DESCRIPTION,
  },
  {
    name: BROWSE_WEB_TOOL_NAME,
    signature: "(goal)",
    description: BROWSE_WEB_DESCRIPTION,
  },
  {
    name: IMAGE_GENERATE_TOOL_NAME,
    signature: "(prompt, size?)",
    description: IMAGE_GENERATE_DESCRIPTION,
  },
];

export function buildEnabledMcpToolDescriptionLines(
  enabledToolNames: string[],
): string[] {
  const enabled = new Set(enabledToolNames);
  return TOOL_GUIDANCE.filter((tool) => enabled.has(tool.name)).map(
    (tool) => `- ${tool.name}${tool.signature}: ${tool.description}`,
  );
}
