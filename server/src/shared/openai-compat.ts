import type { ChatCompletion } from "openai/resources/chat/completions";
import type { JsonSchemaResponseFormat } from "./json-schema.js";

/** OpenAI-compatible assistant message fields used by common reasoning backends. */
export const ASSISTANT_MESSAGE_FIELDS = {
  content: "content",
  /** Legacy or provider-specific reasoning alias. */
  reasoning: "reasoning",
  /** Common reasoning field used by several OpenAI-compatible backends. */
  reasoningContent: "reasoning_content",
} as const;

/** Provider-specific request `options` bag used by several local backends. */
export interface ProviderChatOptions {
  num_ctx: number;
  /** Preserve channel tokens when the backend supports it. */
  skip_special_tokens?: boolean;
}

export interface ParsedAssistantMessage {
  /** Final answer: parse JSON reply and side-pass objects from this only. */
  content: string;
  /** Reasoning: never merge into user-facing reply text. */
  reasoning: string;
}

export interface ProviderChatExtensions {
  options: ProviderChatOptions;
  reasoning_effort?: ReasoningEffort;
}

/** OpenAI-standard reasoning effort levels (Ollama also accepts "max"). */
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "max";

/** Side passes use low effort when thinking is enabled (main reply may be higher). */
export const AUXILIARY_REASONING_EFFORT: ReasoningEffort = "low";

/** Active reasoning-effort levels, lowest first (excludes the "off" value "none"). */
const REASONING_EFFORT_LADDER: readonly ReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "max",
];

/**
 * Lower reasoning effort by one step for a thinking-runaway retry, never below
 * "low" so thinking stays on. "none"/"low" both retry at "low".
 */
export function boundedRetryEffort(effort: ReasoningEffort): ReasoningEffort {
  const idx = REASONING_EFFORT_LADDER.indexOf(effort);
  if (idx <= 0) return "low";
  return REASONING_EFFORT_LADDER[idx - 1]!;
}

/**
 * Recognize the "thinking runaway" shape: the model spent its whole generation
 * budget inside the reasoning channel and emitted no reply, so the completion
 * stopped on length with reasoning present but content empty. A one-shot retry
 * with more headroom and bounded reasoning recovers a reply without disabling
 * thinking.
 */
export function isThinkingRunaway(
  parsed: ParsedAssistantMessage,
  finishReason: string | null | undefined,
): boolean {
  return (
    finishReason === "length" &&
    parsed.content.trim() === "" &&
    parsed.reasoning.trim() !== ""
  );
}

export interface ProviderChatSettings {
  numCtx: number;
  thinkingEnabled: boolean;
  reasoningEffort: ReasoningEffort;
}

/** Options bag only for dashboard/API previews. */
export function providerRequestExtensions(
  settings: ProviderChatSettings,
): { options: ProviderChatOptions } {
  const extensions = providerChatExtensions(settings, true);
  return { options: extensions.options! };
}

/**
 * OpenAI-compatible chat request extensions for provider-specific options.
 *
 * Only standard OpenAI-compatible fields are sent so any compliant backend
 * works: thinking is controlled through the top-level `reasoning_effort`
 * (Ollama maps it to its `think` value; `"none"` disables reasoning). Reasoning
 * is parsed from a separate backend field when returned, but is never merged
 * into user-facing reply text. Side passes use {@link AUXILIARY_REASONING_EFFORT}
 * when thinking is on.
 */
export function providerChatExtensions(
  settings: ProviderChatSettings,
  auxiliary: boolean,
): Partial<ProviderChatExtensions> {
  const extensions: Partial<ProviderChatExtensions> = {
    options: {
      num_ctx: settings.numCtx,
      skip_special_tokens: false,
    },
  };

  const thinkingOn = settings.thinkingEnabled;
  const effort: ReasoningEffort = !thinkingOn
    ? "none"
    : auxiliary
      ? AUXILIARY_REASONING_EFFORT
      : settings.reasoningEffort;

  if (effort !== "none") {
    extensions.reasoning_effort = effort;
  }

  return extensions;
}

/**
 * Whether to attach OpenAI `response_format` for this call.
 *
 * Structured passes always keep the schema. When thinking is on, schemas include
 * a `reasoning` string field so chain-of-thought stays in JSON `content`.
 */
export function shouldUseResponseFormat(
  _settings: ProviderChatSettings,
  _auxiliary: boolean,
  responseFormat?: JsonSchemaResponseFormat,
): responseFormat is JsonSchemaResponseFormat {
  return Boolean(responseFormat);
}

function readReasoningField(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part.trim();
        if (part && typeof part === "object") {
          if ("text" in part && typeof part.text === "string") {
            return part.text.trim();
          }
          if ("content" in part && typeof part.content === "string") {
            return part.content.trim();
          }
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function readTextContent(
  value: string | unknown[] | null | undefined,
): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: string }).text;
        return typeof text === "string" ? text.trim() : "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Map an OpenAI chat completion choice to content + separate reasoning. */
export function parseAssistantMessage(
  choice: ChatCompletion["choices"][number] | undefined,
): ParsedAssistantMessage {
  if (!choice?.message) {
    return { content: "", reasoning: "" };
  }

  const message = choice.message as unknown as Record<string, unknown> & {
    content?: string | unknown[] | null;
    refusal?: string | null;
  };

  const content =
    readTextContent(message.content) ||
    (typeof message.refusal === "string" ? message.refusal.trim() : "");

  const reasoning =
    readReasoningField(message, ASSISTANT_MESSAGE_FIELDS.reasoningContent) ||
    readReasoningField(message, ASSISTANT_MESSAGE_FIELDS.reasoning);

  return { content, reasoning };
}
