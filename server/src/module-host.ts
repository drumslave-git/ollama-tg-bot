import type { ChatMessage, JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import { chatComplete } from "./llm/client.js";
import { config } from "./config.js";
import { logEvent, logEventError, type EventFields } from "./event-log.js";
import { getResolvedSettings } from "./settings-runtime.js";
import type { ModuleLogging } from "@llm-tg-bot/modules-utils";

export function hostLogging(): ModuleLogging {
  return {
    logEvent: (event, fields) => logEvent(event, fields as EventFields),
    logEventError: (event, err, fields) =>
      logEventError(event, err, fields as EventFields),
  };
}

export function hostLlmConfig(): {
  baseUrl: string;
  model: string;
  apiKey?: string;
} {
  const settings = getResolvedSettings();
  return {
    baseUrl: settings.apiBaseUrl,
    model: settings.model,
    apiKey: config.openAiApiKey || undefined,
  };
}

export function hostAuxiliaryChatComplete(options: {
  numPredict: number;
  responseFormat: JsonSchemaResponseFormat;
  traceTurnId?: number;
  traceLabel: string;
  think?: boolean;
}): (messages: ChatMessage[]) => Promise<string> {
  return (messages) =>
    chatComplete(messages, {
      numPredict: options.numPredict,
      auxiliary: true,
      think: options.think,
      responseFormat: options.responseFormat,
      traceTurnId: options.traceTurnId,
      traceLabel: options.traceLabel,
    });
}
