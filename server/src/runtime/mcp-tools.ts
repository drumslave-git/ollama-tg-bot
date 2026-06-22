import type { ModuleLogging } from "../shared/index.js";
import { BotMcpRegistry } from "../shared/index.js";
import { config } from "../config/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { MODULE_REGISTRY } from "./module-registry.js";

interface RegisteredMcpModule {
  workflowStepId: string;
  toolNames: string[];
  alwaysOn: boolean;
}

let registry: BotMcpRegistry | null = null;
const registeredModules: RegisteredMcpModule[] = [];

function mcpHostContext(): {
  getSecret: (name: "tavily" | "openai") => string;
  logging: ModuleLogging;
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

  for (const entry of MODULE_REGISTRY) {
    if (!entry.mcpTools) continue;
    registry.registerTools(entry.mcpTools.registrar, context);
    registeredModules.push({
      workflowStepId: entry.mcpTools.workflowStepId,
      toolNames: [...entry.mcpTools.toolNames],
      alwaysOn: entry.mcpTools.alwaysOn ?? false,
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

export function resolveEnabledMcpToolNames(workflowSteps: string[]): string[] {
  const enabled = new Set<string>();
  for (const module of registeredModules) {
    if (!module.alwaysOn && !workflowSteps.includes(module.workflowStepId)) {
      continue;
    }
    for (const toolName of module.toolNames) {
      enabled.add(toolName);
    }
  }
  return [...enabled];
}
