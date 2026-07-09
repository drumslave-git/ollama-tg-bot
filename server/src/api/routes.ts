import { Router } from "express";
import { settingsRouter } from "./routes/settings.js";
import { statsRouter } from "./routes/stats.js";
import { debugRouter } from "./routes/debug.js";
import { dataRouter } from "./routes/data.js";
import { participationRouter } from "./routes/participation.js";
import type { FeatureEntry } from "../runtime/feature-registry.js";
import type { Router as ExpressRouter } from "express";

export function createApiRouter(
  featureRouters: Array<{ entry: FeatureEntry; router: ExpressRouter }> = [],
): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.use("/settings", settingsRouter);
  router.use("/stats", statsRouter);
  router.use("/participation", participationRouter);
  router.use("/debug", debugRouter);
  router.use("/data", dataRouter);

  for (const { entry, router: featureRouter } of featureRouters) {
    if (!entry.apiBasePath) continue;
    router.use(entry.apiBasePath, featureRouter);
  }

  router.use((_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  return router;
}
