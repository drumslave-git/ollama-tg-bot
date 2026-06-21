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
  let conversation: ChatCompletionMessageParam[] = toOpenAiSeedMessages(messages);
  let accumulatedThinking = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const toolRound = await chatCompleteDetailed(conversation, {
      ...options,
      responseFormat: undefined,
      allowToolCalls: true,
    });
    accumulatedThinking = [accumulatedThinking, toolRound.thinking]
      .filter(Boolean)
      .join("\n\n");

    const toolCalls = toolRound.toolCalls ?? [];
    if (toolCalls.length === 0) {
      if (toolRound.raw.trim()) {
        return {
          raw: toolRound.raw,
          thinking: accumulatedThinking,
        };
      }
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

  const final = await chatCompleteDetailed(conversation, {
    model: options.model,
    numPredict: options.numPredict,
    think: options.think,
    responseFormat: options.responseFormat as JsonSchemaResponseFormat | undefined,
    traceTurnId: options.traceTurnId,
    traceLabel: options.traceLabel,
    traceLayout: options.traceLayout as VerbosePromptLayout | undefined,
  });

  return {
    raw: final.raw,
    thinking: [accumulatedThinking, final.thinking].filter(Boolean).join("\n\n"),
  };
}
