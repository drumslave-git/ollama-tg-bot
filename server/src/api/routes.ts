import { Router } from "express";
import { settingsRouter } from "./routes/settings.js";
import { statsRouter } from "./routes/stats.js";
import { debugRouter } from "./routes/debug.js";
import { dataRouter } from "./routes/data.js";
import { modulesRouter } from "./routes/modules.js";
import type { ModuleManifest } from "@llm-tg-bot/modules-registry";
import type { Router as ExpressRouter } from "express";

export function createApiRouter(
  moduleRouters: Array<{ manifest: ModuleManifest; router: ExpressRouter }> = [],
): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.use("/modules", modulesRouter);
  router.use("/settings", settingsRouter);
  router.use("/stats", statsRouter);
  router.use("/debug", debugRouter);
  router.use("/data", dataRouter);

  for (const { manifest, router: moduleRouter } of moduleRouters) {
    if (!manifest.apiBasePath) continue;
    router.use(manifest.apiBasePath, moduleRouter);
  }

  router.use((_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  return router;
}
