import type {
  PipelineHostServices,
  PipelineModuleHost,
  PipelinePhase,
  PipelinePhaseWriteOptions,
  PipelineShouldRunResult,
  PipelineStepResult,
  PipelineTurnState,
} from "@llm-tg-bot/modules-registry";
import { getPipelineHosts } from "../runtime/module-hosts.js";

export function isPipelineStepEnabled(
  host: PipelineModuleHost,
  enabledSteps: string[],
): boolean {
  if (host.alwaysOn) return true;
  return enabledSteps.includes(host.stepId);
}

function phaseWriteOptions(
  result: PipelineStepResult,
): PipelinePhaseWriteOptions | undefined {
  return result.replace ? { replace: true } : undefined;
}

function evaluateShouldRun(result: PipelineShouldRunResult): {
  run: boolean;
  summary?: string;
  omitFromReport?: boolean;
} {
  if (typeof result === "boolean") {
    return result
      ? { run: true }
      : { run: false, summary: "Not needed for this turn" };
  }
  return {
    run: false,
    summary: result.summary ?? "Not needed for this turn",
    omitFromReport: result.omitFromReport,
  };
}

function hostDebugTitle(host: PipelineModuleHost): string {
  return host.debugTitle ?? host.stepId;
}

function recordStepResult(
  result: PipelineStepResult,
  services: PipelineHostServices,
  turnId: number,
): void {
  const report = services.getReport(turnId);
  if (!report) return;

  const writeOptions = phaseWriteOptions(result);

  switch (result.status) {
    case "ok":
      report.okPhase(
        result.phaseId,
        result.phaseTitle,
        result.summary,
        result.durationMs,
        result.detail,
        writeOptions,
      );
      break;
    case "skipped":
      report.skipPhase(
        result.phaseId,
        result.phaseTitle,
        result.summary,
        writeOptions,
      );
      break;
    case "failed":
      report.failPhase(
        result.phaseId,
        result.phaseTitle,
        result.summary,
        result.durationMs,
        writeOptions,
      );
      break;
    case "halt":
      report.skipPhase(
        result.phaseId,
        result.phaseTitle,
        result.summary,
        writeOptions,
      );
      break;
  }
}

export async function runPipelineHost(
  host: PipelineModuleHost,
  state: PipelineTurnState,
  services: PipelineHostServices,
  options?: {
    recordResult?: boolean | ((result: PipelineStepResult) => boolean);
  },
): Promise<PipelineStepResult | null> {
  if (host.shouldRun) {
    const decision = evaluateShouldRun(host.shouldRun(state, services));
    if (!decision.run) {
      if (decision.omitFromReport) return null;
      services
        .getReport(state.turnId)
        ?.skipPhase(
          host.stepId,
          hostDebugTitle(host),
          decision.summary ?? "Not needed for this turn",
        );
      return null;
    }
  }
  const result = await host.run(state, services);
  const shouldRecord =
    typeof options?.recordResult === "function"
      ? options.recordResult(result)
      : (options?.recordResult ?? true);
  if (shouldRecord) recordStepResult(result, services, state.turnId);
  return result;
}

export async function runPipelinePhase(
  phase: PipelinePhase,
  state: PipelineTurnState,
  services: PipelineHostServices,
): Promise<void> {
  const enabledSteps = services.getWorkflowSteps();
  const hosts = getPipelineHosts().filter((host) => host.phase === phase);

  for (const host of hosts) {
    if (!isPipelineStepEnabled(host, enabledSteps)) {
      services
        .getReport(state.turnId)
        ?.skipPhase(
          host.stepId,
          hostDebugTitle(host),
          "Disabled in workflow",
        );
      continue;
    }

    await runPipelineHost(host, state, services);
  }
}
