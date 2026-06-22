import { getSettings } from "../db/index.js";
import {
  getIntakePipelineHosts,
  getQueuePipelineHosts,
} from "../runtime/module-hosts.js";
import { getModuleEntries } from "../runtime/modules.js";
import { buildWorkflowDefinitionFromHosts } from "./workflow-definition.js";

function manifestByModuleId(): Map<string, { name: string; description: string }> {
  const map = new Map<string, { name: string; description: string }>();
  for (const entry of getModuleEntries()) {
    map.set(entry.id, {
      name: entry.dashboard?.label ?? entry.name,
      description: entry.description,
    });
  }
  return map;
}

export function buildWorkflowDefinition(enabledSteps: string[]) {
  return buildWorkflowDefinitionFromHosts(
    getIntakePipelineHosts(),
    getQueuePipelineHosts(),
    manifestByModuleId(),
    enabledSteps,
  );
}

export function buildWorkflowDefinitionFromSettings() {
  const enabledSteps = getSettings().workflowSteps ?? [];
  return buildWorkflowDefinition(enabledSteps);
}
