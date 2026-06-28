import { Router } from "express";
import {
  getVisionModuleConfig,
  updateVisionModuleConfig,
} from "./module-config.js";

export const visionRouter = Router();

visionRouter.get("/config", async (_req, res) => {
  res.json(await getVisionModuleConfig());
});

visionRouter.patch("/config", async (req, res) => {
  try {
    const body = req.body as Partial<{ backfillDebounceSec: number }>;
    const updated = await updateVisionModuleConfig({
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
