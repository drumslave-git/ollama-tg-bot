import { getSettings } from "../db/index.js";
import {
  getIntakePipelineHosts,
  getQueuePipelineHosts,
} from "../runtime/feature-hosts.js";
import { getFeatureEntries } from "../runtime/features.js";
import { buildWorkflowDefinitionFromHosts } from "./workflow-definition.js";

function manifestByFeatureId(): Map<string, { name: string; description: string }> {
  const map = new Map<string, { name: string; description: string }>();
  for (const entry of getFeatureEntries()) {
    map.set(entry.id, {
      name: entry.name,
      description: entry.description,
    });
  }
  return map;
}

export function buildWorkflowDefinition(enabledSteps: string[]) {
  return buildWorkflowDefinitionFromHosts(
    getIntakePipelineHosts(),
    getQueuePipelineHosts(),
    manifestByFeatureId(),
    enabledSteps,
  );
}

export async function buildWorkflowDefinitionFromSettings() {
  const enabledSteps = (await getSettings()).workflowSteps ?? [];
  return buildWorkflowDefinition(enabledSteps);
}
