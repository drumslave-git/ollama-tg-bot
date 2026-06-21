import type { ChatMessage, JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import type {
  PipelineHostServices,
  PipelineLlmServices,
  PipelineReportWriter,
  PipelineTelegramContext,
} from "@llm-tg-bot/modules-registry";
import { chatComplete, chatCompleteDetailed } from "../llm/client.js";
import { chatCompleteWithTools } from "../llm/tool-loop.js";
import { config } from "../config/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { getMessageReport } from "../debug/message-report.js";
import { getResolvedSettings } from "../settings/runtime.js";
import { createPipelineCallbacks } from "./adapters/callbacks.js";
import {
  getMcpRegistry,
  resolveEnabledMcpToolNames,
} from "../runtime/mcp-tools.js";

function toReportWriter(turnId: number): PipelineReportWriter | null {
  const report = getMessageReport(turnId);
  if (!report) return null;
  return {
    okPhase: (id, title, summary, durationMs, detail, options) =>
      report.okPhase(id, title, summary, durationMs, detail as never, options),
    skipPhase: (id, title, summary, options) =>
      report.skipPhase(id, title, summary, options),
    failPhase: (id, title, summary, durationMs, options) =>
      report.failPhase(id, title, summary, durationMs, options),
    completeMemory: (input) => report.completeMemory(input),
  };
}

function createLlmServices(): PipelineLlmServices {
  const settings = getResolvedSettings();
  return {
    baseUrl: config.llmBaseUrl,
    model: settings.model,
    apiKey: config.llmApiKey || undefined,
    createAuxiliaryChatComplete: (options) => (messages) =>
      chatComplete(messages as ChatMessage[], {
        numPredict: options.numPredict,
        auxiliary: true,
        think: options.think,
        responseFormat: options.responseFormat as JsonSchemaResponseFormat,
        traceTurnId: options.traceTurnId,
        traceLabel: options.traceLabel,
      }),
    createMainChatComplete: (options) => async (messages) => {
      const workflowSteps = getResolvedSettings().workflowSteps ?? [];
      const registry = getMcpRegistry();
      registry.setEnabledToolNames(resolveEnabledMcpToolNames(workflowSteps));
      const tools = await registry.listOpenAiTools();

      if (tools.length === 0) {
        const result = await chatCompleteDetailed(messages as ChatMessage[], {
          think: options.think,
          responseFormat: options.responseFormat as JsonSchemaResponseFormat,
          traceTurnId: options.traceTurnId,
          traceLabel: options.traceLabel,
          traceLayout: options.traceLayout as never,
        });
        return { raw: result.raw, thinking: result.thinking };
      }

      const result = await chatCompleteWithTools(messages as ChatMessage[], {
        think: options.think,
        responseFormat: options.responseFormat as JsonSchemaResponseFormat,
        traceTurnId: options.traceTurnId,
        traceLabel: options.traceLabel,
        traceLayout: options.traceLayout as never,
        tools,
        callTool: (name, args) => registry.callTool(name, args),
        onToolCall: ({ name, result }) => {
          if (options.traceTurnId == null) return;
          getMessageReport(options.traceTurnId)?.okPhase(
            "links",
            "Link fetch",
            `MCP tool ${name}: ${result.slice(0, 120)}`,
          );
        },
      });
      return { raw: result.raw, thinking: result.thinking };
    },
  };
}

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
      if (name === "openai") return config.llmApiKey;
      return "";
    },
    mcp: {
      listOpenAiTools: async () => {
        const registry = getMcpRegistry();
        registry.setEnabledToolNames(
          resolveEnabledMcpToolNames(getResolvedSettings().workflowSteps ?? []),
        );
        return registry.listOpenAiTools();
      },
      callTool: (name, args) => {
        const registry = getMcpRegistry();
        registry.setEnabledToolNames(
          resolveEnabledMcpToolNames(getResolvedSettings().workflowSteps ?? []),
        );
        return registry.callTool(name, args);
      },
    },
    callbacks: createPipelineCallbacks(),
  };
}

export function createInitialPipelineState(input: {
  turnId: number;
  telegram: PipelineTelegramContext;
  rawText: string;
}): import("@llm-tg-bot/modules-registry").PipelineTurnState {
  return {
    turnId: input.turnId,
    telegram: input.telegram,
    rawText: input.rawText,
    latestBody: input.rawText,
  };
}
