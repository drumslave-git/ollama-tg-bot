import { Router } from "express";
import {
  getProcessingDetail,
  listProcessingChats,
  listProcessingsForChat,
} from "../../db/debug/message-processing.js";
import {
  getTaskProcessingDetail,
  listProcessingsForTask,
  listTaskGroups,
} from "../../db/debug/task-processing.js";
import {
  getJobProcessingDetail,
  listProcessingsForFeature,
} from "../../db/debug/job-processing.js";
import { getPhaseTimingStats } from "../../db/debug/phase-timings.js";
import { getLlmUsageWindow } from "../../db/debug/llm-usage.js";

export const debugRouter = Router();

// ---- Per-phase latency stats (dashboard latency panel) --------------------

debugRouter.get("/phase-timings", async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
  res.json({ days, phases: await getPhaseTimingStats(days) });
});

// ---- LLM token usage (dashboard token panel) ------------------------------

debugRouter.get("/llm-usage", async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
  res.json(await getLlmUsageWindow(days));
});

// ---- Message processings (chats → processings → entries) -----------------

debugRouter.get("/chats", async (_req, res) => {
  res.json({ chats: await listProcessingChats() });
});

debugRouter.get("/chat/:entityId", async (req, res) => {
  res.json({ processings: await listProcessingsForChat(req.params.entityId) });
});

debugRouter.get("/processing/:id", async (req, res) => {
  const processing = await getProcessingDetail(Number(req.params.id));
  if (!processing) return res.status(404).json({ error: "Processing not found" });
  res.json({ processing });
});

// ---- Task fire processings (tasks → fires → entries) ---------------------

debugRouter.get("/tasks", async (_req, res) => {
  res.json({ tasks: await listTaskGroups() });
});

debugRouter.get("/task/:taskId", async (req, res) => {
  res.json({ fires: await listProcessingsForTask(Number(req.params.taskId)) });
});

debugRouter.get("/task-processing/:id", async (req, res) => {
  const fire = await getTaskProcessingDetail(Number(req.params.id));
  if (!fire) return res.status(404).json({ error: "Task fire not found" });
  res.json({ fire });
});

// ---- Scheduled job run processings (features → runs → entries) -----------

debugRouter.get("/job/:featureId", async (req, res) => {
  res.json({ runs: await listProcessingsForFeature(req.params.featureId) });
});

debugRouter.get("/job-processing/:id", async (req, res) => {
  const run = await getJobProcessingDetail(Number(req.params.id));
  if (!run) return res.status(404).json({ error: "Job run not found" });
  res.json({ run });
});
