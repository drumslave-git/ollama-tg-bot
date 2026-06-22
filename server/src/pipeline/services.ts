import type { ChatMessage, JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import type {
  PipelineHostServices,
  PipelineLlmServices,
  PipelineReportWriter,
  PipelineTelegramContext,
} from "@llm-tg-bot/modules-registry";
import { readSearchWebSources } from "@llm-tg-bot/modules-web-search";
import type { WebSearchSource } from "@llm-tg-bot/modules-web-search";
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
import { SEARCH_WEB_TOOL_NAME } from "@llm-tg-bot/modules-web-search";
import { FETCH_LINK_TOOL_NAME } from "@llm-tg-bot/modules-link-fetch";

function mcpToolTrace(name: string): { phaseId: string; phaseTitle: string } {
  if (name === SEARCH_WEB_TOOL_NAME) {
    return { phaseId: "search", phaseTitle: "Web search" };
  }
  if (name === FETCH_LINK_TOOL_NAME) {
    return { phaseId: "links", phaseTitle: "Link fetch" };
  }
  return { phaseId: "mcp", phaseTitle: "MCP tool" };
}

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
      const webSearchSources: WebSearchSource[] = [];

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
        onToolCall: ({ name, result: toolResult }) => {
          if (name === SEARCH_WEB_TOOL_NAME) {
            webSearchSources.push(
              ...readSearchWebSources(toolResult.structuredContent),
            );
          }
          if (options.traceTurnId == null) return;
          const trace = mcpToolTrace(name);
          getMessageReport(options.traceTurnId)?.okPhase(
            trace.phaseId,
            trace.phaseTitle,
            `MCP tool ${name}: ${toolResult.text.slice(0, 120)}`,
          );
        },
      });
      return {
        raw: result.raw,
        thinking: result.thinking,
        webSearchSources,
      };
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
