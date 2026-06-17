import type {
  PipelineModuleHost,
  PipelineHostServices,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";
import type { ModuleLogging } from "@llm-tg-bot/modules-utils";
import { responseFormatForThinking } from "@llm-tg-bot/modules-utils";
import type { JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import {
  MEMORY_EXTRACT_NUM_PREDICT,
  MEMORY_MERGE_NUM_PREDICT,
  MEMORY_EXTRACT_RESPONSE_FORMAT,
  MEMORY_MERGE_RESPONSE_FORMAT,
  scheduleMemoryPersistence,
  type MemoryPersistContext,
} from "./persist.js";
import type { MemoryExtractInput } from "./extract-prompt.js";

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

function buildMemoryConfig(
  services: PipelineHostServices,
  traceLabel: string,
  numPredict: number,
  baseFormat: JsonSchemaResponseFormat,
  traceTurnId: number,
) {
  const settings = services.callbacks.getSettings?.() ?? {};
  const thinkingEnabled = Boolean(settings.thinkingEnabled);
  const responseFormat = responseFormatForThinking(baseFormat, thinkingEnabled);

  return {
    baseUrl: services.llm.baseUrl,
    model: services.llm.model,
    apiKey: services.llm.apiKey,
    numPredict,
    thinkingEnabled,
    log: hostLogging(services),
    chatComplete: services.llm.createAuxiliaryChatComplete({
      numPredict,
      think: true,
      responseFormat,
      traceTurnId,
      traceLabel,
    }),
  };
}

export const memoryNotAddressedHost: PipelineModuleHost = {
  id: "memory",
  stepId: "memory",
  debugTitle: "Memory extraction",
  phase: "not-addressed",
  order: 10,
  alwaysOn: true,

  shouldRun(state) {
    if (state.shouldReply) {
      return { run: false, omitFromReport: true };
    }
    if (!state.memoryInput) {
      return { run: false, summary: "No message content to analyze" };
    }
    return true;
  },

  async run(state, services): Promise<PipelineStepResult> {
    const callbacks = services.callbacks.memoryCallbacks;
    if (!callbacks) {
      return {
        status: "failed",
        phaseId: "memory",
        phaseTitle: "Memory extraction",
        summary: "Memory callbacks not configured",
      };
    }

    const memoryInput = state.memoryInput as MemoryExtractInput;
    const ctx: MemoryPersistContext = {
      userId: state.userId ?? null,
      groupChatId: state.groupChatId ?? null,
      turnId: state.turnId,
      input: {
        ...memoryInput,
        assistantReply: "",
      },
    };

    const report = services.getReport(state.turnId);
    scheduleMemoryPersistence(
      ctx,
      {
        extract: buildMemoryConfig(
          services,
          "memory extract (passive)",
          MEMORY_EXTRACT_NUM_PREDICT,
          MEMORY_EXTRACT_RESPONSE_FORMAT,
          state.turnId,
        ),
        merge: buildMemoryConfig(
          services,
          "memory merge (passive)",
          MEMORY_MERGE_NUM_PREDICT,
          MEMORY_MERGE_RESPONSE_FORMAT,
          state.turnId,
        ),
        log: hostLogging(services),
      },
      callbacks,
      (memoryReport) => {
        report?.completeMemory?.(memoryReport);
      },
      (err) => {
        report?.completeMemory?.({
          updated: false,
          scopes: [],
          error: err instanceof Error ? err.message : String(err),
        });
      },
    );

    return {
      status: "ok",
      phaseId: "memory",
      phaseTitle: "Memory extraction",
      summary: "Extracting from ignored message…",
      replace: true,
    };
  },
};

export const memoryPostReplyHost: PipelineModuleHost = {
  id: "memory",
  stepId: "memory",
  debugTitle: "Memory extraction",
  phase: "background",
  order: 10,
  alwaysOn: true,

  shouldRun(state) {
    return Boolean(state.shouldReply && state.memoryInput && state.assistantReply);
  },

  async run(state, services): Promise<PipelineStepResult> {
    const callbacks = services.callbacks.memoryCallbacks;
    if (!callbacks) {
      return {
        status: "failed",
        phaseId: "memory",
        phaseTitle: "Memory extraction",
        summary: "Memory callbacks not configured",
      };
    }

    const memoryInput = state.memoryInput as MemoryExtractInput;
    const ctx: MemoryPersistContext = {
      userId: state.userId ?? null,
      groupChatId: state.groupChatId ?? null,
      turnId: state.turnId,
      input: {
        ...memoryInput,
        assistantReply: state.assistantReply ?? "",
      },
    };

    const report = services.getReport(state.turnId);

    scheduleMemoryPersistence(
      ctx,
      {
        extract: buildMemoryConfig(
          services,
          "memory extract",
          MEMORY_EXTRACT_NUM_PREDICT,
          MEMORY_EXTRACT_RESPONSE_FORMAT,
          state.turnId,
        ),
        merge: buildMemoryConfig(
          services,
          "memory merge",
          MEMORY_MERGE_NUM_PREDICT,
          MEMORY_MERGE_RESPONSE_FORMAT,
          state.turnId,
        ),
        log: hostLogging(services),
      },
      callbacks,
      (memoryReport) => {
        report?.completeMemory?.(memoryReport);
      },
      (err) => {
        report?.completeMemory?.({
          updated: false,
          scopes: [],
          error: err instanceof Error ? err.message : String(err),
        });
      },
    );

    return {
      status: "ok",
      phaseId: "memory",
      phaseTitle: "Memory extraction",
      summary: "Extracting after reply…",
      replace: true,
    };
  },
};

export const pipelineHosts = [memoryNotAddressedHost, memoryPostReplyHost];
