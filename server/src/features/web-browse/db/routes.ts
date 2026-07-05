import { Router } from "express";
import {
  getBrowserAgentRun,
  listBrowserAgentRuns,
} from "./browser-agent-runs.js";
import { getBrowserAgentProcessingForRun } from "../../../db/debug/browser-agent-processing.js";

export const browserRouter = Router();

browserRouter.get("/runs", async (_req, res) => {
  res.json({ runs: await listBrowserAgentRuns() });
});

browserRouter.get("/run/:id", async (req, res) => {
  const id = Number(req.params.id);
  const run = await getBrowserAgentRun(id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  const processing = await getBrowserAgentProcessingForRun(id);
  res.json({ run, processing });
});

export function createBrowserRouter(): Router {
  return browserRouter;
}
