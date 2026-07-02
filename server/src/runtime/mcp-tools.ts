import type { FeatureLogging } from "../shared/index.js";
import { BotMcpRegistry } from "../shared/index.js";
import type { Settings } from "../db/index.js";
import { config } from "../config/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { FEATURE_REGISTRY } from "./feature-registry.js";

interface RegisteredMcpFeature {
  workflowStepId: string;
  toolNames: string[];
  alwaysOn: boolean;
  /** When set, the tools are enabled only if this settings key holds a truthy value. */
  requiresSettingKey?: string;
}

let registry: BotMcpRegistry | null = null;
const registeredFeatures: RegisteredMcpFeature[] = [];

function mcpHostContext(): {
  getSecret: (name: "tavily" | "openai") => string;
  logging: FeatureLogging;
} {
  return {
    getSecret: (name) => {
      if (name === "tavily") return config.tavilyApiKey;
      if (name === "openai") return config.llmApiKey;
      return "";
    },
    logging: {
      logEvent: (event, fields) => logEvent(event, fields as never),
      logEventError: (event, err, fields) =>
        logEventError(event, err, fields as never),
    },
  };
}

export async function loadMcpTools(): Promise<BotMcpRegistry> {
  if (registry) return registry;

  registry = new BotMcpRegistry();
  const context = mcpHostContext();

  for (const entry of FEATURE_REGISTRY) {
    if (!entry.mcpTools) continue;
    registry.registerTools(entry.mcpTools.registrar, context);
    registeredFeatures.push({
      workflowStepId: entry.mcpTools.workflowStepId,
      toolNames: [...entry.mcpTools.toolNames],
      alwaysOn: entry.mcpTools.alwaysOn ?? false,
      requiresSettingKey: entry.mcpTools.requiresSettingKey,
    });
  }

  await registry.finishRegistration();
  return registry;
}

export function getMcpRegistry(): BotMcpRegistry {
  if (!registry) {
    throw new Error("MCP tools not loaded — call loadMcpTools() at startup");
  }
  return registry;
}

export function resolveEnabledMcpToolNames(settings: Settings): string[] {
  const workflowSteps = settings.workflowSteps ?? [];
  const settingsRecord = settings as unknown as Record<string, unknown>;
  const enabled = new Set<string>();
  for (const feature of registeredFeatures) {
    if (!feature.alwaysOn && !workflowSteps.includes(feature.workflowStepId)) {
      continue;
    }
    // Capability gate: e.g. image_generate is exposed only once an image model
    // is picked in Settings — the model selection is its on/off switch.
    if (
      feature.requiresSettingKey &&
      !settingsRecord[feature.requiresSettingKey]
    ) {
      continue;
    }
    for (const toolName of feature.toolNames) {
      enabled.add(toolName);
    }
  }
  return [...enabled];
}
