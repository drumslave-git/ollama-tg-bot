import { Router } from "express";
import { settingsRouter } from "./routes/settings.js";
import { statsRouter } from "./routes/stats.js";
import { debugRouter } from "./routes/debug.js";
import { dataRouter } from "./routes/data.js";
import { modulesRouter } from "./routes/modules.js";
import { workflowRouter } from "./routes/workflow.js";
import type { ModuleEntry } from "../runtime/module-registry.js";
import type { Router as ExpressRouter } from "express";

export function createApiRouter(
  moduleRouters: Array<{ entry: ModuleEntry; router: ExpressRouter }> = [],
): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.use("/modules", modulesRouter);
  router.use("/workflow", workflowRouter);
  router.use("/settings", settingsRouter);
  router.use("/stats", statsRouter);
  router.use("/debug", debugRouter);
  router.use("/data", dataRouter);

  for (const { entry, router: moduleRouter } of moduleRouters) {
    if (!entry.apiBasePath) continue;
    router.use(entry.apiBasePath, moduleRouter);
  }

  router.use((_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  return router;
}
