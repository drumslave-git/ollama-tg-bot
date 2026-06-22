import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import {
  auxiliaryChatComplete,
  mergeAssistantReasoning,
  parseAssistantMessage,
  providerChatExtensions,
  type ProviderChatSettings,
} from "../../../../src/shared/index.js";
import {
  compressHistoryChat,
  HISTORY_COMPRESS_NUM_PREDICT,
  type HistoryCompressChatMessage,
  type HistoryCompressDeps,
  type HistoryCompressResult,
} from "../../../../src/features/history/compress.js";
import { ASSISTANT_ROLE, type StoredMessage } from "../../../../src/features/history/types.js";

export interface LiveConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function liveConfig(): LiveConfig | null {
  const rawBase = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!rawBase || !model) return null;
  return {
    baseUrl: rawBase.replace(/\/v1\/?$/, ""),
    model,
    apiKey: (process.env.LLM_API_KEY ?? "").trim() || "not-needed",
  };
}

/** True when the live reasoning suite (`test:llm:reasoning`) is active. */
export function liveReasoningMode(): boolean {
  const raw = process.env.LLM_THINKING_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function sampleCompressionHistory(): StoredMessage[] {
  return [
    {
      role: "user:alice:424242",
      content: "hey Arguella, how are you?",
    },
    {
      role: ASSISTANT_ROLE,
      content: "[assistant said]: Still on stage. What do you need?",
    },
    {
      role: "user:alice:424242",
      content:
        "I'm a 35-year-old frontend developer. Can you tell me about The Finals game?",
    },
    {
      role: ASSISTANT_ROLE,
      content: "[assistant said]: Another mask — code and shooters.",
    },
    {
      role: "user:alice:424242",
      content:
        "[sent image]: a terminal showing HTTP 500 Internal Server Error",
    },
    {
      role: ASSISTANT_ROLE,
      content: "[assistant said]: The server costume rips — perfect drama.",
    },
  ];
}

function buildProviderSettings(thinkingEnabled: boolean): ProviderChatSettings {
  return {
    numCtx: 8192,
    topK: 40,
    repeatPenalty: 1.1,
    thinkingEnabled,
    reasoningEffort: thinkingEnabled ? "low" : "none",
  };
}

async function liveChatComplete(
  cfg: LiveConfig,
  messages: HistoryCompressChatMessage[],
  thinkingEnabled: boolean,
  numPredict?: number,
): Promise<string> {
  const providerSettings = buildProviderSettings(thinkingEnabled);
  const budget = numPredict ?? HISTORY_COMPRESS_NUM_PREDICT;

  if (!thinkingEnabled) {
    return auxiliaryChatComplete(
      { baseUrl: cfg.baseUrl, model: cfg.model, apiKey: cfg.apiKey },
      messages,
      { numPredict: budget, providerSettings },
    );
  }

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl.endsWith("/v1") ? cfg.baseUrl : `${cfg.baseUrl}/v1`,
    maxRetries: 0,
    timeout: 180_000,
  });
  const completion = await client.chat.completions.create({
    model: cfg.model,
    messages,
    stream: false,
    max_completion_tokens: Math.max(1024, budget),
    temperature: 0.2,
    ...providerChatExtensions(providerSettings, true),
  } as ChatCompletionCreateParamsNonStreaming);
  const choice = completion.choices[0];
  const { content, reasoning } = parseAssistantMessage(choice);
  const merged = mergeAssistantReasoning(content, reasoning);
  const text = content.trim() || merged.trim();
  if (!text) {
    throw new Error("LLM returned empty compression response");
  }
  return text;
}

export function buildLiveCompressDeps(
  cfg: LiveConfig,
  history: StoredMessage[],
  thinkingEnabled: boolean,
): HistoryCompressDeps & { readStored: () => StoredMessage[] } {
  let stored = [...history];
  return {
    readStored: () => stored,
    getHistory: () => stored,
    replaceHistory: (_chatKey, messages) => {
      stored = messages;
    },
    getHistoryLimits: () => ({ historyMaxTokens: 8000 }),
    chatComplete: (messages, options) =>
      liveChatComplete(cfg, messages, thinkingEnabled, options?.numPredict),
  };
}

export async function runLiveCompression(
  cfg: LiveConfig,
  thinkingEnabled: boolean,
): Promise<{ result: HistoryCompressResult; summary: string }> {
  const deps = buildLiveCompressDeps(
    cfg,
    sampleCompressionHistory(),
    thinkingEnabled,
  );
  const result = await compressHistoryChat("live-test", deps, { force: true });
  return { result, summary: deps.readStored()[0]?.content ?? "" };
}
