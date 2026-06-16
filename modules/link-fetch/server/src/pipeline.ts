import type {
  PipelineModuleHost,
  PipelineStepResult,
  PipelineHostServices,
} from "@llm-tg-bot/modules-registry";
import type { ModuleLogging } from "@llm-tg-bot/modules-utils";
import { runLinkFetch } from "./fetch.js";

function hostLogging(services: PipelineHostServices): ModuleLogging {
  return {
    logEvent: (event, fields) =>
      services.logging.logEvent(event, fields as Record<string, unknown>),
    logEventError: (event, err, fields) =>
      services.logging.logEventError(
        event,
        err,
        fields as Record<string, unknown>,
      ),
  };
}

export const pipelineHost: PipelineModuleHost = {
  id: "link-fetch",
  stepId: "links",
  phase: "pre-reply",
  order: 20,

  async run(state, services): Promise<PipelineStepResult> {
    const started = performance.now();
    const result = await runLinkFetch(
      {
        message: state.latestBody,
        replyContext: state.replyContext,
      },
      { log: hostLogging(services) },
    );

    state.linkFetchContext = result.context;
    state.linkFetchResolved = result.resolved;
    state.linkFetchUrlCount = result.urlCount;

    if (result.urlCount > 0) {
      return {
        status: "ok",
        phaseId: "links",
        phaseTitle: "Link fetch",
        summary: `Fetched ${result.urlCount} URL(s)`,
        durationMs: performance.now() - started,
      };
    }

    return {
      status: "skipped",
      phaseId: "links",
      phaseTitle: "Link fetch",
      summary: "No links in message",
      durationMs: performance.now() - started,
    };
  },
};
