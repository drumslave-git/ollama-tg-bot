import type { McpToolCallResult } from "@llm-tg-bot/modules-utils";
import type { JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type {
  ChatCompleteOptions,
  ChatCompleteResult,
  ChatMessage,
  VerbosePromptLayout,
} from "./client.js";
import { chatCompleteDetailed } from "./client.js";
import { buildToolRoundSystemPrompt } from "../pipeline/adapters/system-prompt.js";

const MAX_TOOL_ROUNDS = 6;

export interface ToolLoopOptions extends ChatCompleteOptions {
  tools: ChatCompletionTool[];
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<McpToolCallResult>;
  onToolCall?: (input: {
    name: string;
    args: Record<string, unknown>;
    result: McpToolCallResult;
    round: number;
  }) => void;
}

function toOpenAiSeedMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.name ? { name: message.name } : {}),
  }));
}

function toolNamesFromOptions(tools: ChatCompletionTool[]): string[] {
  return tools
    .map((tool) => (tool.type === "function" ? tool.function?.name : undefined))
    .filter((name): name is string => Boolean(name));
}

function applyToolRoundSystem(
  conversation: ChatCompletionMessageParam[],
  enabledToolNames: string[],
): ChatCompletionMessageParam[] {
  const toolSystem = buildToolRoundSystemPrompt(enabledToolNames);
  if (conversation.length === 0) {
    return [{ role: "system", content: toolSystem }];
  }
  if (conversation[0]?.role === "system") {
    return [{ role: "system", content: toolSystem }, ...conversation.slice(1)];
  }
  return [{ role: "system", content: toolSystem }, ...conversation];
}

function restoreFullSystem(
  fullSystemContent: string,
  conversation: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  if (!fullSystemContent || conversation.length === 0) {
    return conversation;
  }
  if (conversation[0]?.role === "system") {
    return [{ role: "system", content: fullSystemContent }, ...conversation.slice(1)];
  }
  return [{ role: "system", content: fullSystemContent }, ...conversation];
}

function toolRoundTraceLabel(round: number): string {
  return `main reply tools ${round + 1}`;
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

export async function chatCompleteWithTools(
  messages: ChatMessage[],
  options: ToolLoopOptions,
): Promise<ChatCompleteResult> {
  const seedMessages = toOpenAiSeedMessages(messages);
  const fullSystemContent =
    seedMessages[0]?.role === "system"
      ? String(seedMessages[0].content ?? "")
      : "";
  const enabledToolNames = toolNamesFromOptions(options.tools);

  let conversation = seedMessages;
  let accumulatedThinking = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    conversation = applyToolRoundSystem(conversation, enabledToolNames);

    const toolRound = await chatCompleteDetailed(conversation, {
      model: options.model,
      numPredict: options.numPredict,
      think: false,
      auxiliary: true,
      responseFormat: undefined,
      allowToolCalls: true,
      traceTurnId: options.traceTurnId,
      traceLabel: toolRoundTraceLabel(round),
      tools: options.tools,
    });
    accumulatedThinking = [accumulatedThinking, toolRound.thinking]
      .filter(Boolean)
      .join("\n\n");

    const toolCalls = toolRound.toolCalls ?? [];
    if (toolCalls.length === 0) {
      break;
    }

    if (toolRound.conversationMessages) {
      conversation = toolRound.conversationMessages;
    }

    for (const toolCall of toolCalls) {
      const fn = toolCall.type === "function" ? toolCall.function : null;
      if (!fn?.name) continue;

      const args = parseToolArguments(fn.arguments ?? "{}");
      let toolResult: McpToolCallResult;
      try {
        toolResult = await options.callTool(fn.name, args);
      } catch (err) {
        toolResult = {
          text:
            err instanceof Error ? err.message : "Tool execution failed",
        };
      }

      options.onToolCall?.({
        name: fn.name,
        args,
        result: toolResult,
        round,
      });

      conversation.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult.text,
      });
    }
  }

  const finalConversation = restoreFullSystem(fullSystemContent, conversation);

  const final = await chatCompleteDetailed(finalConversation, {
    model: options.model,
    numPredict: options.numPredict,
    think: options.think,
    responseFormat: options.responseFormat as JsonSchemaResponseFormat | undefined,
    traceTurnId: options.traceTurnId,
    traceLabel: options.traceLabel ?? "main reply",
    traceLayout: options.traceLayout as VerbosePromptLayout | undefined,
  });

  return {
    raw: final.raw,
    thinking: [accumulatedThinking, final.thinking].filter(Boolean).join("\n\n"),
  };
}
