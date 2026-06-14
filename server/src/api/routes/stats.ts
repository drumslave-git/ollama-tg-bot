import { Router } from "express";
import { buildStatsPayload } from "../../dashboard-payloads.js";
import { clearErrors } from "../../db/database.js";

export const statsRouter = Router();

statsRouter.get("/", (_req, res) => {
  try {
    res.json(buildStatsPayload());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to load stats",
    });
  }
});

statsRouter.post("/errors/clear", (_req, res) => {
  clearErrors();
  res.json({ ok: true });
});
