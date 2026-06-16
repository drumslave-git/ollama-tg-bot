import type { ChatMessage, JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import type {
  PipelineHostCallbacks,
  PipelineHostServices,
  PipelineLlmServices,
  PipelineReportWriter,
} from "@llm-tg-bot/modules-registry";
import { chatComplete } from "../llm/client.js";
import { config } from "../config.js";
import { logEvent, logEventError } from "../event-log.js";
import { getMessageReport } from "../message-report.js";
import { getResolvedSettings } from "../settings-runtime.js";
import { getBotIdentity } from "../bot/bot-identity.js";
import { getStickerCatalogForSelection } from "../bot/sticker-catalog.js";
import { getEffectiveMood, saveMoodState } from "../db/mood.js";
import { replaceGeneralFacts } from "../db/general-memory.js";
import { replaceGroupFacts } from "../db/group-memory.js";
import { replaceUserFacts } from "../db/user-memory.js";
import { getSettings } from "../db/database.js";

function toReportWriter(turnId: number): PipelineReportWriter | null {
  const report = getMessageReport(turnId);
  if (!report) return null;
  return {
    okPhase: (id, title, summary, durationMs, detail) =>
      report.okPhase(id, title, summary, durationMs, detail as never),
    skipPhase: (id, title, summary) => report.skipPhase(id, title, summary),
    failPhase: (id, title, summary, durationMs) =>
      report.failPhase(id, title, summary, durationMs),
    completeMemory: (input) => report.completeMemory(input),
  };
}

function createLlmServices(): PipelineLlmServices {
  const settings = getResolvedSettings();
  return {
    baseUrl: settings.apiBaseUrl,
    model: settings.model,
    apiKey: config.openAiApiKey || undefined,
    createAuxiliaryChatComplete: (options) => (messages) =>
      chatComplete(messages as ChatMessage[], {
        numPredict: options.numPredict,
        auxiliary: true,
        think: options.think,
        responseFormat: options.responseFormat as JsonSchemaResponseFormat,
        traceTurnId: options.traceTurnId,
        traceLabel: options.traceLabel,
      }),
  };
}

const callbacks: PipelineHostCallbacks = {
  getBotIdentity: () => getBotIdentity(),
  getEffectiveMood: () => getEffectiveMood(),
  saveMoodState: (mood) => saveMoodState(mood as never),
  getStickerCatalog: () => getStickerCatalogForSelection(),
  getSettings: () => getSettings() as unknown as Record<string, unknown>,
  memoryCallbacks: {
    replaceUserFacts,
    replaceGroupFacts,
    replaceGeneralFacts,
  },
};

export function createPipelineServices(): PipelineHostServices {
  return {
    logging: {
      logEvent: (event, fields) => logEvent(event, fields as never),
      logEventError: (event, err, fields) =>
        logEventError(event, err, fields as never),
    },
    llm: createLlmServices(),
    getWorkflowSteps: () => getResolvedSettings().workflowSteps ?? [],
    getReport: toReportWriter,
    getSecret: (name) => {
      if (name === "tavily") return config.tavilyApiKey;
      if (name === "openai") return config.openAiApiKey;
      return "";
    },
    callbacks,
  };
}
