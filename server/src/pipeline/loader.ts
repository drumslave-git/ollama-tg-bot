import type { PipelineModuleHost } from "@llm-tg-bot/modules-registry";
import {
  discoverModuleManifests,
  type ModuleManifest,
} from "@llm-tg-bot/modules-registry";
import { resolveModulesRoot } from "../module-runtime.js";

let pipelineHosts: PipelineModuleHost[] | null = null;

export async function loadPipelineHosts(): Promise<PipelineModuleHost[]> {
  if (pipelineHosts) return pipelineHosts;

  const manifests = discoverModuleManifests(resolveModulesRoot()).filter(
    (manifest): manifest is ModuleManifest & { serverPackage: string } =>
      Boolean(manifest.serverPackage && manifest.pipeline),
  );

  const loaded: PipelineModuleHost[] = [];

  for (const manifest of manifests) {
    const mod = (await import(manifest.serverPackage)) as {
      pipelineHost?: PipelineModuleHost;
    };
    if (!mod.pipelineHost) {
      throw new Error(
        `Module ${manifest.id} declares pipeline metadata but exports no pipelineHost`,
      );
    }
    const host = mod.pipelineHost;
    if (host.id !== manifest.id) {
      throw new Error(
        `Module ${manifest.id} pipelineHost.id mismatch: ${host.id}`,
      );
    }
    loaded.push(host);
  }

  pipelineHosts = loaded.sort((a, b) => {
    if (a.phase !== b.phase) {
      const order: Record<string, number> = {
        gate: 0,
        "pre-reply": 1,
        "post-reply": 2,
        background: 3,
      };
      return (order[a.phase] ?? 99) - (order[b.phase] ?? 99);
    }
    return a.order - b.order;
  });

  return pipelineHosts;
}

export function getPipelineHosts(): PipelineModuleHost[] {
  if (!pipelineHosts) {
    throw new Error("Pipeline hosts not loaded — call loadPipelineHosts() at startup");
  }
  return pipelineHosts;
}
