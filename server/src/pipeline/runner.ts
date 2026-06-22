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

function isStepEnabled(
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

async function runHost(
  host: PipelineModuleHost,
  state: PipelineTurnState,
  services: PipelineHostServices,
): Promise<PipelineStepResult | null> {
  if (host.shouldRun) {
    const decision = evaluateShouldRun(host.shouldRun(state, services));
    if (!decision.run) {
      if (decision.omitFromReport) return null;
      return {
        status: "skipped",
        phaseId: host.stepId,
        phaseTitle: hostDebugTitle(host),
        summary: decision.summary ?? "Not needed for this turn",
      };
    }
  }
  return host.run(state, services);
}

export async function runPipelinePhase(
  phase: PipelinePhase,
  state: PipelineTurnState,
  services: PipelineHostServices,
): Promise<void> {
  const enabledSteps = services.getWorkflowSteps();
  const hosts = getPipelineHosts().filter((host) => host.phase === phase);

  for (const host of hosts) {
    if (!isStepEnabled(host, enabledSteps)) {
      services
        .getReport(state.turnId)
        ?.skipPhase(
          host.stepId,
          hostDebugTitle(host),
          "Disabled in workflow",
        );
      continue;
    }

    const result = await runHost(host, state, services);
    if (result) recordStepResult(result, services, state.turnId);
  }
}
