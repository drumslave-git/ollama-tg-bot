import { Router } from "express";
import { getModuleEntries } from "../../runtime/modules.js";

export const modulesRouter = Router();

modulesRouter.get("/", (_req, res) => {
  const modules = getModuleEntries().map((entry) => ({
    id: entry.id,
    name: entry.name,
    description: entry.description,
    apiBasePath: entry.apiBasePath ?? null,
    settingsKeys: entry.settingsKeys ?? [],
    dataTables: entry.dataTables ?? [],
    dashboard: entry.dashboard ?? null,
    hasDb: Boolean(entry.db),
    hasUi: Boolean(entry.hasUi),
  }));
  res.json({ modules });
});
