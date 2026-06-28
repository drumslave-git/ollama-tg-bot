import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FeatureLogging } from "../../shared/index.js";
import {
  getTaskById,
  listTasks,
  searchTasks,
  type TaskRecord,
} from "./db/tasks.js";
import {
  createTaskValidated,
  deleteTaskValidated,
  summarizeTask,
  TaskValidationError,
  updateTaskValidated,
} from "./service.js";
import { getTaskTurnContext } from "./turn-context.js";

export const TASKS_CREATE_TOOL_NAME = "tasks_create";
export const TASKS_UPDATE_TOOL_NAME = "tasks_update";
export const TASKS_DELETE_TOOL_NAME = "tasks_delete";
export const TASKS_GET_TOOL_NAME = "tasks_get";
export const TASKS_LIST_TOOL_NAME = "tasks_list";
export const TASKS_SEARCH_TOOL_NAME = "tasks_search";

export const TASKS_TOOL_NAMES = [
  TASKS_CREATE_TOOL_NAME,
  TASKS_UPDATE_TOOL_NAME,
  TASKS_DELETE_TOOL_NAME,
  TASKS_GET_TOOL_NAME,
  TASKS_LIST_TOOL_NAME,
  TASKS_SEARCH_TOOL_NAME,
];

const scheduleKind = z.enum(["once", "daily", "weekly"]);

export interface TasksMcpConfig {
  log?: FeatureLogging;
}

function textResult(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: structured,
  };
}

function errorResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true as const,
  };
}

function taskView(task: TaskRecord) {
  return {
    id: task.id,
    instruction: task.instruction,
    schedule_kind: task.scheduleKind,
    time: task.timeOfDay,
    weekdays: task.weekdays,
    run_date: task.runDate,
    enabled: task.enabled,
    next_run_at: task.nextRunAt,
    timezone: task.timezone,
    summary: summarizeTask(task),
  };
}

export function registerTasksMcpTools(
  server: McpServer,
  config: TasksMcpConfig = {},
): void {
  const ownerWrite = "Only the owner can manage tasks.";

  server.registerTool(
    TASKS_CREATE_TOOL_NAME,
    {
      title: "Create scheduled task",
      description:
        "Create a scheduled task that posts a message into THIS chat at a wall-clock time. " +
        "Use when the owner asks the bot to do something on a schedule (e.g. 'ask how I'm doing every day at 17:00'). " +
        "instruction is a self-contained directive the bot will rephrase in-character on each fire — keep entities as " +
        "[user:name:id] tags from the [SESSION] block or history. schedule_kind: 'daily' (give time), " +
        "'weekly' (give time + weekdays, 0=Sunday..6=Saturday), or 'once' (give time + date YYYY-MM-DD). " +
        "time is HH:MM 24-hour in the bot timezone. Owner only.",
      inputSchema: z.object({
        instruction: z
          .string()
          .min(2)
          .describe("What the task should do, as a self-contained directive"),
        schedule_kind: scheduleKind.describe("once, daily, or weekly"),
        time: z.string().describe("Local time of day as HH:MM (24-hour)"),
        weekdays: z
          .array(z.number().int().min(0).max(6))
          .default([])
          .describe("Weekdays for 'weekly' (0=Sunday..6=Saturday)"),
        date: z
          .string()
          .default("")
          .describe("Date for 'once' as YYYY-MM-DD"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ instruction, schedule_kind, time, weekdays, date }) => {
      const ctx = getTaskTurnContext();
      if (!ctx?.isOwner) return errorResult(ownerWrite);
      try {
        const task = await createTaskValidated({
          chatId: ctx.chatId,
          messageThreadId: ctx.messageThreadId,
          entityId: ctx.entityId,
          createdByUserId: ctx.userId ?? "",
          instruction,
          scheduleKind: schedule_kind,
          timeOfDay: time,
          weekdays: weekdays ?? [],
          runDate: date?.trim() ? date.trim() : null,
        });
        config.log?.logEvent?.("tasks_tool_create", {
          id: task.id,
          chatId: ctx.chatId,
        });
        return textResult(`Task created: ${summarizeTask(task)}`, {
          ok: true,
          task: taskView(task),
        });
      } catch (err) {
        if (err instanceof TaskValidationError) return errorResult(err.message);
        throw err;
      }
    },
  );

  server.registerTool(
    TASKS_UPDATE_TOOL_NAME,
    {
      title: "Update scheduled task",
      description:
        "Change an existing task in this chat — its instruction, time, or schedule. " +
        "Use when the owner replies to a task's message to reschedule it (the [SESSION] block names the linked task id). " +
        "Pass only the fields to change. To STOP or CANCEL a task, use tasks_delete instead — set enabled:false only to temporarily pause a recurring task. Owner only.",
      inputSchema: z.object({
        id: z.number().int().describe("Task id to update"),
        instruction: z.string().default("").describe("New instruction (optional)"),
        schedule_kind: z
          .enum(["once", "daily", "weekly", ""])
          .default("")
          .describe("New schedule kind (optional)"),
        time: z.string().default("").describe("New time HH:MM (optional)"),
        weekdays: z
          .array(z.number().int().min(0).max(6))
          .default([])
          .describe("New weekdays for 'weekly' (optional)"),
        date: z.string().default("").describe("New date YYYY-MM-DD for 'once' (optional)"),
        enabled: z
          .boolean()
          .nullable()
          .default(null)
          .describe("Enable or disable the task (optional)"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ id, instruction, schedule_kind, time, weekdays, date, enabled }) => {
      const ctx = getTaskTurnContext();
      if (!ctx?.isOwner) return errorResult(ownerWrite);
      const existing = await getTaskById(id);
      if (!existing || existing.chatId !== ctx.chatId) {
        return errorResult(`No task #${id} in this chat.`);
      }
      try {
        const updated = await updateTaskValidated(id, {
          instruction: instruction.trim() ? instruction.trim() : undefined,
          scheduleKind: schedule_kind ? schedule_kind : undefined,
          timeOfDay: time.trim() ? time.trim() : undefined,
          weekdays: weekdays.length > 0 ? weekdays : undefined,
          runDate: date.trim() ? date.trim() : undefined,
          enabled: enabled === null ? undefined : enabled,
        });
        if (!updated) return errorResult(`No task #${id} in this chat.`);
        config.log?.logEvent?.("tasks_tool_update", { id });
        return textResult(`Task updated: ${summarizeTask(updated)}`, {
          ok: true,
          task: taskView(updated),
        });
      } catch (err) {
        if (err instanceof TaskValidationError) return errorResult(err.message);
        throw err;
      }
    },
  );

  server.registerTool(
    TASKS_DELETE_TOOL_NAME,
    {
      title: "Delete scheduled task",
      description:
        "Permanently remove a task in this chat. This is how you STOP or CANCEL a task — " +
        "use it whenever the owner says to stop/cancel a task or no longer needs it " +
        "(often by replying to its message — the [SESSION] block names the linked task id). " +
        "Prefer this over disabling. Owner only.",
      inputSchema: z.object({
        id: z.number().int().describe("Task id to delete"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      const ctx = getTaskTurnContext();
      if (!ctx?.isOwner) return errorResult(ownerWrite);
      const existing = await getTaskById(id);
      if (!existing || existing.chatId !== ctx.chatId) {
        return errorResult(`No task #${id} in this chat.`);
      }
      const deleted = await deleteTaskValidated(id);
      config.log?.logEvent?.("tasks_tool_delete", { id, deleted });
      return textResult(
        deleted ? `Task #${id} cancelled.` : `No task #${id} in this chat.`,
        { ok: deleted, id },
      );
    },
  );

  server.registerTool(
    TASKS_GET_TOOL_NAME,
    {
      title: "Get scheduled task",
      description:
        "Read one task in this chat by id, including its schedule and next run time. Owner only.",
      inputSchema: z.object({
        id: z.number().int().describe("Task id to read"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      const ctx = getTaskTurnContext();
      if (!ctx?.isOwner) return errorResult(ownerWrite);
      const task = await getTaskById(id);
      if (!task || task.chatId !== ctx.chatId) {
        return errorResult(`No task #${id} in this chat.`);
      }
      return textResult(summarizeTask(task), { ok: true, task: taskView(task) });
    },
  );

  server.registerTool(
    TASKS_LIST_TOOL_NAME,
    {
      title: "List scheduled tasks",
      description:
        "List all scheduled tasks for THIS chat. Use to answer 'what tasks/reminders do I have?'. Owner only.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const ctx = getTaskTurnContext();
      if (!ctx?.isOwner) return errorResult(ownerWrite);
      const tasks = await listTasks(ctx.chatId);
      const text =
        tasks.length === 0
          ? "(no scheduled tasks in this chat)"
          : tasks.map((t) => summarizeTask(t)).join("\n");
      return textResult(text, {
        ok: true,
        count: tasks.length,
        tasks: tasks.map(taskView),
      });
    },
  );

  server.registerTool(
    TASKS_SEARCH_TOOL_NAME,
    {
      title: "Search scheduled tasks",
      description:
        "Case-insensitive substring search over this chat's task instructions. Owner only.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Substring to look for in task instructions"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query }) => {
      const ctx = getTaskTurnContext();
      if (!ctx?.isOwner) return errorResult(ownerWrite);
      const tasks = await searchTasks(query, ctx.chatId);
      const text =
        tasks.length === 0
          ? "(no matching tasks)"
          : tasks.map((t) => summarizeTask(t)).join("\n");
      return textResult(text, {
        ok: true,
        count: tasks.length,
        tasks: tasks.map(taskView),
      });
    },
  );
}
