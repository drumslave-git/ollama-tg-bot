import {
  BotMcpRegistry,
  type McpToolRegistrar,
} from "@llm-tg-bot/modules-utils";
import {
  discoverModuleManifests,
  type ModuleManifest,
} from "@llm-tg-bot/modules-registry";
import { resolveModulesRoot } from "./modules.js";

type ServerManifest = ModuleManifest & {
  serverPackage: string;
  mcpTools: NonNullable<ModuleManifest["mcpTools"]>;
};

interface RegisteredMcpModule {
  workflowStepId: string;
  toolNames: string[];
}

let registry: BotMcpRegistry | null = null;
const registeredModules: RegisteredMcpModule[] = [];

function mcpManifests(): ServerManifest[] {
  return discoverModuleManifests(resolveModulesRoot()).filter(
    (manifest): manifest is ServerManifest =>
      Boolean(manifest.serverPackage && manifest.mcpTools),
  );
}

export async function loadMcpTools(): Promise<BotMcpRegistry> {
  if (registry) return registry;

  registry = new BotMcpRegistry();

  for (const manifest of mcpManifests()) {
    const mod = (await import(manifest.serverPackage)) as {
      registerMcpTools?: McpToolRegistrar;
    };
    if (!mod.registerMcpTools) {
      throw new Error(
        `Module ${manifest.id} declares mcpTools but does not export registerMcpTools`,
      );
    }
    registry.registerTools(mod.registerMcpTools);
    registeredModules.push({
      workflowStepId: manifest.mcpTools.workflowStepId,
      toolNames: [...manifest.mcpTools.toolNames],
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
    if (!workflowSteps.includes(module.workflowStepId)) continue;
    for (const toolName of module.toolNames) {
      enabled.add(toolName);
    }
  }
  return [...enabled];
}
