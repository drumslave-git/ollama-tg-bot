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
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

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
  /**
   * Cap on tool-call rounds. When reached, the tools are taken away and the
   * model is asked once for a final tool-free answer. Unset = unbounded (the
   * default: the run finishes when the model answers or the loop guard trips).
   */
  maxRounds?: number;
}

/**
 * A single tool call (same name + same arguments) executed this many times over
 * one run means the model is looping — it keeps retrying the same action, or
 * cycling through the same set of actions, without making progress. When any
 * call reaches this count the loop is stopped and a final answer is forced.
 * This catches slow cycles that the per-round stall guard (a round that ONLY
 * repeats already-executed calls) misses, since a cycle sneaks a new call in
 * each round.
 */
const MAX_TOOL_CALL_REPEATS = 3;

function toOpenAiSeedMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  // Use the shared converter so user images survive as image_url content —
  // the model reads them in the same pass as the text (no separate vision call).
  return messages.map(toOpenAiMessage);
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

function joinThinking(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Main reply with tools as ONE conversation. Each round the model either
 * answers — that response IS the reply — or emits tool_calls; tool results are
 * appended and the same conversation is sent again. There is no separate
 * tool-selection pass and no system-prompt swap: every request carries the
 * same system prompt, so a message that needs no tools costs a single
 * inference and the backend's prompt cache keeps its prefix between rounds.
 *
 * Termination is progress-driven: a round with no tool calls ends the loop
 * with the answer; a round that only repeats calls already executed this turn,
 * or any single call repeated {@link MAX_TOOL_CALL_REPEATS} times (a stuck or
 * looping model), gets the tools taken away for one final forced-answer call.
 * When the loop is stopped that way, the result carries `loopDetected: true` so
 * the caller can fail the task rather than treat the forced answer as success.
 */
export async function chatCompleteWithTools(
  messages: ChatMessage[],
  options: ToolLoopOptions,
): Promise<ChatCompleteResult> {
  let conversation = toOpenAiSeedMessages(messages);
  let accumulatedThinking = "";
  // Count executions per tool-call signature (name+args): membership answers
  // "did we run this before?" and the count answers "are we looping on it?".
  const signatureCounts = new Map<string, number>();
  let loopDetected = false;
  const baseLabel = options.traceLabel ?? "main reply";

  for (let round = 0; ; round += 1) {
    // Step budget: stop asking for tools and force a final answer.
    if (options.maxRounds != null && round >= options.maxRounds) break;

    const response = await chatCompleteDetailed(conversation, {
      model: options.model,
      numPredict: options.numPredict,
      think: options.think,
      responseFormat: options.responseFormat as JsonSchemaResponseFormat | undefined,
      allowToolCalls: true,
      tools: options.tools,
      traceTurnId: options.traceTurnId,
      traceLabel: round === 0 ? baseLabel : `${baseLabel} · after tools ${round}`,
      traceLayout:
        round === 0
          ? (options.traceLayout as VerbosePromptLayout | undefined)
          : undefined,
    });
    accumulatedThinking = joinThinking(accumulatedThinking, response.thinking);

    const toolCalls = response.toolCalls ?? [];
    if (toolCalls.length === 0) {
      return { raw: response.raw, thinking: accumulatedThinking };
    }

    // Stall guard: if every call this round just repeats one already executed,
    // the model has stopped making progress — take the tools away below and
    // force a text answer.
    const hasNewCall = toolCalls.some(
      (call) => !signatureCounts.has(toolCallSignature(call)),
    );
    if (!hasNewCall) {
      loopDetected = true;
      break;
    }

    if (response.conversationMessages) {
      conversation = response.conversationMessages;
    }

    for (const toolCall of toolCalls) {
      const fn = toolCall.type === "function" ? toolCall.function : null;
      if (!fn?.name) continue;
      const signature = toolCallSignature(toolCall);
      const timesRun = (signatureCounts.get(signature) ?? 0) + 1;
      signatureCounts.set(signature, timesRun);
      // Slow-loop guard: the same action keeps recurring across rounds (a cycle
      // that dodges the per-round stall check by mixing in a new call each time).
      if (timesRun >= MAX_TOOL_CALL_REPEATS) loopDetected = true;

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

      // A tool that returned images (e.g. a page screenshot) feeds them back to
      // the model as a follow-up user message — the tool role can't legally
      // carry image content, so a vision-capable model reads them next round.
      if (toolResult.images?.length) {
        conversation.push({
          role: "user",
          content: [
            { type: "text", text: `Result image(s) from ${fn.name}:` },
            ...toolResult.images.map((image) => ({
              type: "image_url" as const,
              image_url: { url: `data:image/png;base64,${image}` },
            })),
          ],
        });
      }
    }

    // A call tripped the repeat threshold above — the tool results are recorded,
    // so break to the forced final answer with full context of the loop.
    if (loopDetected) break;
  }

  const final = await chatCompleteDetailed(conversation, {
    model: options.model,
    numPredict: options.numPredict,
    think: options.think,
    responseFormat: options.responseFormat as JsonSchemaResponseFormat | undefined,
    traceTurnId: options.traceTurnId,
    traceLabel: `${baseLabel} · final`,
  });

  return {
    raw: final.raw,
    thinking: joinThinking(accumulatedThinking, final.thinking),
    loopDetected,
  };
}
