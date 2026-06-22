import { Router } from "express";
import {
  getVisionJobDebugSnapshot,
  getVisionJobRunDetail,
} from "../index.js";
import {
  getVisionModuleConfig,
  updateVisionModuleConfig,
} from "./module-config.js";

export const visionRouter = Router();

visionRouter.get("/config", (_req, res) => {
  res.json(getVisionModuleConfig());
});

visionRouter.get("/debug", (_req, res) => {
  res.json(getVisionJobDebugSnapshot());
});

visionRouter.get("/debug/runs/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid run id" });
  }
  const run = getVisionJobRunDetail(id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json({ run });
});

visionRouter.patch("/config", (req, res) => {
  try {
    const body = req.body as Partial<{ backfillDebounceSec: number }>;
    const updated = updateVisionModuleConfig({
      backfillDebounceSec: body.backfillDebounceSec,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Invalid vision config",
    });
  }
});

export function createVisionRouter(): Router {
  return visionRouter;
}
