import { Router } from "express";
import { settingsRouter } from "./routes/settings.js";
import { memoriesRouter } from "./routes/memories.js";
import { moodRouter } from "./routes/mood.js";
import { statsRouter } from "./routes/stats.js";
import { debugRouter } from "./routes/debug.js";
import { dataRouter } from "./routes/data.js";

export function createApiRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.use("/settings", settingsRouter);
  router.use("/memories", memoriesRouter);
  router.use("/mood", moodRouter);
  router.use("/stats", statsRouter);
  router.use("/debug", debugRouter);
  router.use("/data", dataRouter);

  router.use((_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  return router;
}
