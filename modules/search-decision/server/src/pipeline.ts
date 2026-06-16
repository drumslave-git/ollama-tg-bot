import type {
  PipelineModuleHost,
  PipelineHostServices,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import type { ModuleLogging } from "@llm-tg-bot/modules-utils";
import {
  analyzeSearchNeed,
} from "./analyze.js";
import { SEARCH_RESPONSE_FORMAT } from "./prompt.js";
import { runWebSearch } from "@llm-tg-bot/modules-web-search";

const SEARCH_CHECK_NUM_PREDICT = 192;

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
  id: "search-decision",
  stepId: "search",
  phase: "pre-reply",
  order: 30,

  async run(state, services): Promise<PipelineStepResult> {
    const tavilyKey = services.getSecret("tavily");
    if (!tavilyKey) {
      return {
        status: "skipped",
        phaseId: "search",
        phaseTitle: "Web search",
        summary: "Tavily not configured",
      };
    }

    if (state.linkFetchResolved) {
      return {
        status: "skipped",
        phaseId: "search",
        phaseTitle: "Web search",
        summary: "Skipped because link content was fetched",
      };
    }

    const started = performance.now();
    const decision = await analyzeSearchNeed(
      {
        message: state.latestBody,
        replyContext: state.replyContext,
        traceTurnId: state.turnId,
      },
      {
        baseUrl: services.llm.baseUrl,
        model: services.llm.model,
        apiKey: services.llm.apiKey,
        searchEnabled: true,
        numPredict: SEARCH_CHECK_NUM_PREDICT,
        log: hostLogging(services),
        chatComplete: services.llm.createAuxiliaryChatComplete({
          numPredict: SEARCH_CHECK_NUM_PREDICT,
          responseFormat: SEARCH_RESPONSE_FORMAT,
          traceTurnId: state.turnId,
          traceLabel: "web search decision",
        }),
      },
    );

    if (!decision.needsSearch || !decision.query) {
      const skipReason =
        decision.reason && decision.reason !== "LLM decision: no"
          ? decision.reason
          : "Not needed";
      return {
        status: "skipped",
        phaseId: "search",
        phaseTitle: "Web search",
        summary: skipReason,
        durationMs: performance.now() - started,
      };
    }

    const searchStarted = performance.now();
    const result = await runWebSearch(
      { query: decision.query },
      { apiKey: tavilyKey, log: hostLogging(services) },
    );

    state.webSearchContext = result.context;
    state.webSearchSources = result.sources;

    if (result.ok) {
      return {
        status: "ok",
        phaseId: "search",
        phaseTitle: "Web search",
        summary: `Query "${decision.query}" · ${result.results.length} source(s)`,
        durationMs: performance.now() - searchStarted,
      };
    }

    return {
      status: "failed",
      phaseId: "search",
      phaseTitle: "Web search",
      summary: result.reason,
      durationMs: performance.now() - searchStarted,
    };
  },
};
