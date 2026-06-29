import type { McpToolCallResult } from "../shared/index.js";
import type { JsonSchemaResponseFormat } from "../shared/index.js";
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
import { chatCompleteDetailed, toOpenAiMessage } from "./client.js";
import {
  buildToolRoundSystemPrompt,
  extractSessionBlock,
} from "../pipeline/adapters/system-prompt.js";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

export interface ToolLoopOptions extends ChatCompleteOptions {
  tools: ChatCompletionTool[];
  /** Generation budget for the tool-selection rounds (separate from the final reply). */
  toolRoundNumPredict?: number;
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
  // Use the shared converter so user images survive as image_url content —
  // the model reads them in the same pass as the text (no separate vision call).
  return messages.map(toOpenAiMessage);
}

function toolNamesFromOptions(tools: ChatCompletionTool[]): string[] {
  return tools
    .map((tool) => (tool.type === "function" ? tool.function?.name : undefined))
    .filter((name): name is string => Boolean(name));
}

function applyToolRoundSystem(
  conversation: ChatCompletionMessageParam[],
  enabledToolNames: string[],
  sessionBlock: string,
): ChatCompletionMessageParam[] {
  const toolSystem = buildToolRoundSystemPrompt(enabledToolNames, sessionBlock);
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

/** Stable identity for a tool call, used to detect a model that stops making progress. */
function toolCallSignature(toolCall: ChatCompletionMessageToolCall): string {
  if (toolCall.type !== "function" || !toolCall.function?.name) return "";
  return `${toolCall.function.name}:${toolCall.function.arguments ?? ""}`;
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
  const sessionBlock = extractSessionBlock(fullSystemContent);
  const enabledToolNames = toolNamesFromOptions(options.tools);

  let conversation = seedMessages;
  let accumulatedThinking = "";
  // No fixed round cap: the model keeps calling tools until it has what it needs.
  // Termination is driven by progress instead — a round that produces no tool
  // call, or only repeats of calls already run this turn, ends the loop and lets
  // the model answer. That bounds a stuck/looping model without an arbitrary limit.
  const executedSignatures = new Set<string>();

  for (let round = 0; ; round += 1) {
    conversation = applyToolRoundSystem(
      conversation,
      enabledToolNames,
      sessionBlock,
    );

    const toolRound = await chatCompleteDetailed(conversation, {
      model: options.model,
      numPredict: options.toolRoundNumPredict ?? options.numPredict,
      think: options.think,
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

    // Stall guard: if every call this round just repeats one already executed,
    // the model has stopped making progress — stop looping and let it answer.
    const hasNewCall = toolCalls.some(
      (call) => !executedSignatures.has(toolCallSignature(call)),
    );
    if (!hasNewCall) {
      break;
    }

    if (toolRound.conversationMessages) {
      conversation = toolRound.conversationMessages;
    }

    for (const toolCall of toolCalls) {
      const fn = toolCall.type === "function" ? toolCall.function : null;
      if (!fn?.name) continue;
      executedSignatures.add(toolCallSignature(toolCall));

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
