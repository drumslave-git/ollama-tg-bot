import type { ChatMessage, JsonSchemaResponseFormat } from "../shared/index.js";
import type {
  PipelineHostServices,
  PipelineLlmServices,
  PipelineReportWriter,
  PipelineTelegramContext,
} from "../contracts/index.js";
import { readSearchWebSources } from "../features/web-search/index.js";
import type { WebSearchSource } from "../features/web-search/index.js";
import {
  IMAGE_GENERATE_TOOL_NAME,
  readGeneratedImages,
} from "../features/image-gen/index.js";
import { chatComplete, chatCompleteDetailed } from "../llm/client.js";
import { chatCompleteWithTools } from "../llm/tool-loop.js";
import { config } from "../config/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { getMessageReport } from "../debug/message-report.js";
import { getSettings } from "../db/index.js";
import { getResolvedSettings } from "../settings/runtime.js";
import {
  getMcpRegistry,
  resolveEnabledMcpToolNames,
} from "../runtime/mcp-tools.js";
import { SEARCH_WEB_TOOL_NAME } from "../features/web-search/index.js";
import { FETCH_LINK_TOOL_NAME } from "../features/link-fetch/index.js";

function mcpToolTrace(name: string): { phaseId: string; phaseTitle: string } {
  if (name === SEARCH_WEB_TOOL_NAME) {
    return { phaseId: "search", phaseTitle: "Web search" };
  }
  if (name === FETCH_LINK_TOOL_NAME) {
    return { phaseId: "links", phaseTitle: "Link fetch" };
  }
  if (name === IMAGE_GENERATE_TOOL_NAME) {
    return { phaseId: "images", phaseTitle: "Image generation" };
  }
  return { phaseId: "mcp", phaseTitle: "MCP tool" };
}

function toReportWriter(turnId: number): PipelineReportWriter | null {
  const report = getMessageReport(turnId);
  if (!report) return null;
  // Entries are append-only, so the old `replace` option has no effect and is
  // intentionally dropped here.
  return {
    okPhase: (id, title, summary, durationMs, detail) =>
      report.okPhase(id, title, summary, durationMs, detail),
    skipPhase: (id, title, summary) => report.skipPhase(id, title, summary),
    failPhase: (id, title, summary, durationMs) =>
      report.failPhase(id, title, summary, durationMs),
  };
}

async function createLlmServices(): Promise<PipelineLlmServices> {
  const settings = getResolvedSettings(await getSettings());
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
      const currentSettings = getResolvedSettings(await getSettings());
      const registry = getMcpRegistry();
      registry.setEnabledToolNames(resolveEnabledMcpToolNames(currentSettings));
      const tools = await registry.listOpenAiTools();
      const webSearchSources: WebSearchSource[] = [];
      const generatedImages: string[] = [];

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
          if (name === IMAGE_GENERATE_TOOL_NAME) {
            generatedImages.push(
              ...readGeneratedImages(toolResult.structuredContent),
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
        generatedImages,
      };
    },
  };
}

export async function createPipelineServices(): Promise<PipelineHostServices> {
  return {
    logging: {
      logEvent: (event, fields) => logEvent(event, fields as never),
      logEventError: (event, err, fields) =>
        logEventError(event, err, fields as never),
    },
    llm: await createLlmServices(),
    getWorkflowSteps: async () =>
      getResolvedSettings(await getSettings()).workflowSteps ?? [],
    getReport: toReportWriter,
  };
}

export function createInitialPipelineState(input: {
  turnId: number;
  telegram: PipelineTelegramContext;
  rawText: string;
}): import("../contracts/index.js").PipelineTurnState {
  return {
    turnId: input.turnId,
    telegram: input.telegram,
    rawText: input.rawText,
    latestBody: input.rawText,
  };
}
