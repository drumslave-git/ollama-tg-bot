import type {
  PipelineHostServices,
  PipelineModuleHost,
  PipelinePhase,
  PipelineStepResult,
  PipelineTurnState,
} from "@llm-tg-bot/modules-registry";
import { getPipelineHosts } from "./loader.js";

function isStepEnabled(
  host: PipelineModuleHost,
  enabledSteps: string[],
): boolean {
  if (host.alwaysOn) return true;
  return enabledSteps.includes(host.stepId);
}

function recordStepResult(
  result: PipelineStepResult,
  services: PipelineHostServices,
  turnId: number,
): void {
  const report = services.getReport(turnId);
  if (!report) return;

  switch (result.status) {
    case "ok":
      report.okPhase(
        result.phaseId,
        result.phaseTitle,
        result.summary,
        result.durationMs,
        result.detail,
      );
      break;
    case "skipped":
      report.skipPhase(result.phaseId, result.phaseTitle, result.summary);
      break;
    case "failed":
      report.failPhase(
        result.phaseId,
        result.phaseTitle,
        result.summary,
        result.durationMs,
      );
      break;
    case "halt":
      report.skipPhase(result.phaseId, result.phaseTitle, result.summary);
      break;
  }
}

async function runHost(
  host: PipelineModuleHost,
  state: PipelineTurnState,
  services: PipelineHostServices,
): Promise<PipelineStepResult> {
  if (host.shouldRun && !host.shouldRun(state, services)) {
    return {
      status: "skipped",
      phaseId: host.stepId,
      phaseTitle: host.stepId,
      summary: "Conditions not met",
    };
  }
  return host.run(state, services);
}

export async function runPipelinePhase(
  phase: PipelinePhase,
  state: PipelineTurnState,
  services: PipelineHostServices,
): Promise<boolean> {
  const enabledSteps = services.getWorkflowSteps();
  const hosts = getPipelineHosts().filter((host) => host.phase === phase);

  for (const host of hosts) {
    if (!isStepEnabled(host, enabledSteps)) {
      services
        .getReport(state.turnId)
        ?.skipPhase(host.stepId, host.stepId, "Skipped (Workflow step disabled)");
      continue;
    }

    const result = await runHost(host, state, services);
    recordStepResult(result, services, state.turnId);

    if (result.status === "halt" || state.halt) {
      return false;
    }
  }

  return true;
}

export function runPipelinePhaseBackground(
  state: PipelineTurnState,
  services: PipelineHostServices,
): void {
  const enabledSteps = services.getWorkflowSteps();
  const hosts = getPipelineHosts().filter((host) => host.phase === "background");

  for (const host of hosts) {
    if (!isStepEnabled(host, enabledSteps)) continue;
    if (host.shouldRun && !host.shouldRun(state, services)) continue;

    void runHost(host, state, services)
      .then((result) => recordStepResult(result, services, state.turnId))
      .catch((err) => {
        services.logging.logEventError("pipeline_background_failed", err, {
          moduleId: host.id,
          turnId: state.turnId,
        });
      });
  }
}
