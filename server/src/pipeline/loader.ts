import type { PipelineModuleHost } from "@llm-tg-bot/modules-registry";
import {
  discoverModuleManifests,
  type ModuleManifest,
} from "@llm-tg-bot/modules-registry";
import { resolveModulesRoot } from "../runtime/modules.js";

let pipelineHosts: PipelineModuleHost[] | null = null;

const PHASE_ORDER: Record<string, number> = {
  preprocess: 0,
  gate: 1,
  "not-addressed": 2,
  "pre-reply": 3,
  reply: 4,
  "post-reply": 5,
  background: 6,
};

function sortHosts(hosts: PipelineModuleHost[]): PipelineModuleHost[] {
  return hosts.sort((a, b) => {
    const phaseDiff = (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99);
    if (phaseDiff !== 0) return phaseDiff;
    return a.order - b.order;
  });
}

export async function loadPipelineHosts(): Promise<PipelineModuleHost[]> {
  if (pipelineHosts) return pipelineHosts;

  const manifests = discoverModuleManifests(resolveModulesRoot()).filter(
    (manifest): manifest is ModuleManifest & { serverPackage: string } =>
      Boolean(manifest.serverPackage),
  );

  const loaded: PipelineModuleHost[] = [];

  for (const manifest of manifests) {
    const mod = (await import(manifest.serverPackage)) as {
      pipelineHost?: PipelineModuleHost;
      pipelineHosts?: PipelineModuleHost[];
    };

    const hosts = mod.pipelineHosts
      ? mod.pipelineHosts
      : mod.pipelineHost
        ? [mod.pipelineHost]
        : [];

    for (const host of hosts) {
      if (host.id !== manifest.id) {
        throw new Error(
          `Module ${manifest.id} pipelineHost.id mismatch: ${host.id}`,
        );
      }
      loaded.push(host);
    }
  }

  pipelineHosts = sortHosts(loaded);
  return pipelineHosts;
}

export function getPipelineHosts(): PipelineModuleHost[] {
  if (!pipelineHosts) {
    throw new Error("Pipeline hosts not loaded — call loadPipelineHosts() at startup");
  }
  return pipelineHosts;
}
