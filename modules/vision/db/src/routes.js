import { Router } from "express";
import { getVisionModuleConfig, updateVisionModuleConfig, } from "./module-config.js";
export const visionRouter = Router();
visionRouter.get("/config", (_req, res) => {
    res.json(getVisionModuleConfig());
});
visionRouter.patch("/config", (req, res) => {
    try {
        const body = req.body;
        const updated = updateVisionModuleConfig({
            backfillDebounceSec: body.backfillDebounceSec,
        });
        res.json(updated);
    }
    catch (err) {
        res.status(400).json({
            error: err instanceof Error ? err.message : "Invalid vision config",
        });
    }
});
export function createVisionRouter() {
    return visionRouter;
}
