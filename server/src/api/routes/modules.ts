import { Router } from "express";
import { getLoadedModuleManifests } from "../../module-runtime.js";

export const modulesRouter = Router();

modulesRouter.get("/", (_req, res) => {
  const modules = getLoadedModuleManifests().map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    apiBasePath: manifest.apiBasePath ?? null,
    settingsKeys: manifest.settingsKeys ?? [],
    dataTables: manifest.dataTables ?? [],
    dashboard: manifest.dashboard ?? null,
    hasDb: Boolean(manifest.dbPackage),
    hasUi: Boolean(manifest.uiPackage),
  }));
  res.json({ modules });
});
