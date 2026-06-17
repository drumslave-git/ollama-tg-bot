import type {
  MessagePipelineResult,
  PipelineHostServices,
  PipelineModuleHost,
  PipelinePhase,
  PipelinePhaseWriteOptions,
  PipelineShouldRunResult,
  PipelineStepResult,
  PipelineTurnState,
} from "@llm-tg-bot/modules-registry";
import { getPipelineHosts } from "../runtime/module-hosts.js";

const PHASE_SEQUENCE: PipelinePhase[] = [
  "preprocess",
  "gate",
  "not-addressed",
  "pre-reply",
  "reply",
  "post-reply",
  "background",
];

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

function shouldRunReplyPhases(state: PipelineTurnState): boolean {
  return Boolean(state.shouldReply);
}

export type MessagePipelineHooks = {
  /** Fires once after the gate phase when the bot will reply (address/trigger confirmed). */
  onReplyConfirmed?: () => void;
};

export async function runMessagePipeline(
  state: PipelineTurnState,
  services: PipelineHostServices,
  hooks?: MessagePipelineHooks,
): Promise<MessagePipelineResult> {
  let replyConfirmedNotified = false;

  for (const phase of PHASE_SEQUENCE) {
    if (state.earlyReply) {
      return { earlyReply: state.earlyReply };
    }

    const isReplyPhase =
      phase === "pre-reply" || phase === "reply" || phase === "post-reply";
    if (isReplyPhase && !shouldRunReplyPhases(state)) {
      continue;
    }

    await runPipelinePhase(phase, state, services);

    if (
      phase === "gate" &&
      state.shouldReply &&
      hooks?.onReplyConfirmed &&
      !replyConfirmedNotified
    ) {
      replyConfirmedNotified = true;
      hooks.onReplyConfirmed();
    }

    if (state.earlyReply) {
      return { earlyReply: state.earlyReply };
    }
  }

  if (!state.shouldReply) {
    return {
      ignored: true,
      ignoreReason: state.haltReason ?? "not_addressed",
      addressSource: state.addressSource,
    };
  }

  const delivery =
    state.delivery ??
    services.callbacks.prepareDelivery?.(state) ??
    {};

  return {
    delivery,
    replyTrigger: state.replyTrigger ?? null,
    addressSource: state.addressSource,
  };
}

export function runPipelinePhaseBackground(
  state: PipelineTurnState,
  services: PipelineHostServices,
): void {
  const enabledSteps = services.getWorkflowSteps();
  const hosts = getPipelineHosts().filter((host) => host.phase === "background");

  for (const host of hosts) {
    if (!isStepEnabled(host, enabledSteps)) continue;
    if (host.shouldRun) {
      const decision = evaluateShouldRun(host.shouldRun(state, services));
      if (!decision.run) continue;
    }

    void runHost(host, state, services)
      .then((result) => {
        if (result) recordStepResult(result, services, state.turnId);
      })
      .catch((err) => {
        services.logging.logEventError("pipeline_background_failed", err, {
          moduleId: host.id,
          turnId: state.turnId,
        });
      });
  }
}
