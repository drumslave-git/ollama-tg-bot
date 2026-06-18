import { getSettings } from "../db/index.js";
import { getPipelineHosts } from "../runtime/module-hosts.js";
import { getLoadedModuleManifests } from "../runtime/modules.js";
import { buildWorkflowDefinitionFromHosts } from "./workflow-definition.js";

function manifestByModuleId(): Map<string, { name: string; description: string }> {
  const map = new Map<string, { name: string; description: string }>();
  for (const manifest of getLoadedModuleManifests()) {
    map.set(manifest.id, {
      name: manifest.dashboard?.label ?? manifest.name,
      description: manifest.description,
    });
  }
  return map;
}

export function buildWorkflowDefinition(enabledSteps: string[]) {
  return buildWorkflowDefinitionFromHosts(
    getPipelineHosts(),
    manifestByModuleId(),
    enabledSteps,
  );
}

export function buildWorkflowDefinitionFromSettings() {
  const enabledSteps = getSettings().workflowSteps ?? [];
  return buildWorkflowDefinition(enabledSteps);
}
