import { Router } from "express";
import { buildStatsPayload } from "../../dashboard/payloads.js";
import { clearErrors } from "../../db/index.js";

export const statsRouter = Router();

statsRouter.get("/", async (_req, res) => {
  try {
    res.json(await buildStatsPayload());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to load stats",
    });
  }
});

statsRouter.post("/errors/clear", async (_req, res) => {
  await clearErrors();
  res.json({ ok: true });
});
