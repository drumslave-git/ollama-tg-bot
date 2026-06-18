import { Router } from "express";
import { buildWorkflowDefinitionFromSettings } from "../../pipeline/workflow.js";

export const workflowRouter = Router();

workflowRouter.get("/", (_req, res) => {
  res.json(buildWorkflowDefinitionFromSettings());
});
