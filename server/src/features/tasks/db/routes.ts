import { Router } from "express";
import type { ScheduleKind } from "../schedule.js";
import {
  createTaskValidated,
  deleteTaskValidated,
  TaskValidationError,
  updateTaskValidated,
} from "../service.js";
import { getTaskById, listTasks } from "./tasks.js";
import { clearTaskEvents, listTaskEvents } from "./task-events.js";

function parseChatIdQuery(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseWeekdays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((v) => Number(v)).filter((n) => Number.isInteger(n));
}

export const tasksRouter = Router();

tasksRouter.get("/", (req, res) => {
  res.json({ tasks: listTasks(parseChatIdQuery(req.query.chatId)) });
});

tasksRouter.get("/debug", (_req, res) => {
  res.json({ events: listTaskEvents() });
});

tasksRouter.delete("/debug", (_req, res) => {
  clearTaskEvents();
  res.json({ ok: true });
});

tasksRouter.get("/:id", (req, res) => {
  const task = getTaskById(Number(req.params.id));
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task });
});

tasksRouter.post("/", (req, res) => {
  const body = req.body ?? {};
  const chatId = Number(body.chatId);
  if (!Number.isFinite(chatId)) {
    return res.status(400).json({ error: "chatId is required" });
  }
  try {
    const task = createTaskValidated({
      chatId,
      messageThreadId:
        body.messageThreadId != null ? Number(body.messageThreadId) : null,
      entityId: String(body.entityId ?? chatId),
      createdByUserId: String(body.createdByUserId ?? ""),
      instruction: String(body.instruction ?? ""),
      scheduleKind: body.scheduleKind as ScheduleKind,
      timeOfDay: String(body.timeOfDay ?? ""),
      weekdays: parseWeekdays(body.weekdays),
      runDate: body.runDate != null ? String(body.runDate) : null,
      enabled: body.enabled !== false,
    });
    res.json({ task });
  } catch (err) {
    if (err instanceof TaskValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

tasksRouter.patch("/:id", (req, res) => {
  const body = req.body ?? {};
  try {
    const task = updateTaskValidated(Number(req.params.id), {
      instruction: body.instruction != null ? String(body.instruction) : undefined,
      scheduleKind: body.scheduleKind as ScheduleKind | undefined,
      timeOfDay: body.timeOfDay != null ? String(body.timeOfDay) : undefined,
      weekdays: body.weekdays !== undefined ? parseWeekdays(body.weekdays) : undefined,
      runDate:
        body.runDate !== undefined
          ? body.runDate != null
            ? String(body.runDate)
            : null
          : undefined,
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
    });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ task });
  } catch (err) {
    if (err instanceof TaskValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

tasksRouter.delete("/:id", (req, res) => {
  const ok = deleteTaskValidated(Number(req.params.id));
  res.json({ ok });
});

export function createTasksRouter(): Router {
  return tasksRouter;
}
