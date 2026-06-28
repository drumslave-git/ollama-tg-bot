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
  listJobModules,
  listProcessingsForModule,
} from "../../db/debug/job-processing.js";

export const debugRouter = Router();

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

// ---- Scheduled job run processings (modules → runs → entries) ------------

debugRouter.get("/jobs", async (_req, res) => {
  res.json({ modules: await listJobModules() });
});

debugRouter.get("/job/:moduleId", async (req, res) => {
  res.json({ runs: await listProcessingsForModule(req.params.moduleId) });
});

debugRouter.get("/job-processing/:id", async (req, res) => {
  const run = await getJobProcessingDetail(Number(req.params.id));
  if (!run) return res.status(404).json({ error: "Job run not found" });
  res.json({ run });
});
