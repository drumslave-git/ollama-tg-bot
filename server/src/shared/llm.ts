import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  toOpenAiResponseFormat,
  type JsonSchemaResponseFormat,
} from "./json-schema.js";
import {
  providerChatExtensions,
  type ProviderChatSettings,
} from "./openai-compat.js";

/** Floor for auxiliary side-pass generation budget when thinking is off. */
export const AUXILIARY_NUM_PREDICT = 768;
/** Higher floor when thinking is on — reasoning tokens consume budget before JSON. */
export const AUXILIARY_REASONING_NUM_PREDICT = 1024;

export const AUXILIARY_TEMPERATURE = 0.2;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface AuxiliaryChatOptions {
  numPredict?: number;
  timeoutMs?: number;
  responseFormat?: JsonSchemaResponseFormat;
  /** When set, reasoning flags follow dashboard settings (low effort for side passes). */
  providerSettings?: ProviderChatSettings;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function toParams(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

function pickAssistantContent(
  choice: OpenAI.Chat.Completions.ChatCompletion.Choice,
): string {
  const content = choice.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

/**
 * Stateless auxiliary chat completion for side-pass features.
 * Uses low temperature; when `providerSettings.thinkingEnabled`, sends low reasoning effort.
 */
export async function auxiliaryChatComplete(
  llm: LlmConfig,
  messages: ChatMessage[],
  options: AuxiliaryChatOptions = {},
): Promise<string> {
  const client = new OpenAI({
    apiKey: llm.apiKey?.trim() || "not-needed",
    baseURL: normalizeBaseUrl(llm.baseUrl),
    maxRetries: 0,
    timeout: options.timeoutMs ?? 120_000,
  });

  const thinkingOn = options.providerSettings?.thinkingEnabled === true;
  const floor = thinkingOn
    ? AUXILIARY_REASONING_NUM_PREDICT
    : AUXILIARY_NUM_PREDICT;
  const numPredict = Math.max(floor, options.numPredict ?? 0);

  // With no provider settings, send no reasoning controls; callers that pass
  // dashboard provider settings get either reasoning_effort or enable_thinking.
  const providerExt = options.providerSettings
    ? providerChatExtensions(options.providerSettings, true)
    : {};

  const completion = await client.chat.completions.create({
    model: llm.model,
    messages: toParams(messages),
    stream: false,
    max_tokens: numPredict,
    temperature: AUXILIARY_TEMPERATURE,
    ...providerExt,
    ...(options.responseFormat
      ? { response_format: toOpenAiResponseFormat(options.responseFormat) }
      : {}),
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);

  const text = pickAssistantContent(
    completion.choices[0] ?? { message: { content: "" } },
  );
  if (!text) {
    throw new Error("LLM returned empty auxiliary response");
  }
  return text;
}
