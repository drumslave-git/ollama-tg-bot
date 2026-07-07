import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSettings } from "../helpers/settings.js";

const mocks = vi.hoisted(() => ({
  createChatCompletion: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("openai", () => {
  class APIConnectionError extends Error {}
  class APIConnectionTimeoutError extends Error {}
  class APIError extends Error {
    status?: number;
    error?: unknown;
  }
  class OpenAI {
    chat = { completions: { create: mocks.createChatCompletion } };
    models = { list: vi.fn() };
  }
  return { default: OpenAI, APIConnectionError, APIConnectionTimeoutError, APIError };
});

vi.mock("../../src/config/index.js", () => ({
  config: {
    llmBaseUrl: "http://127.0.0.1:11434",
    llmApiKey: "",
  },
}));

vi.mock("../../src/db/index.js", () => ({
  getSettings: mocks.getSettings,
}));

vi.mock("../../src/features/vision/index.js", () => ({
  normalizeImageForChat: vi.fn(async (base64: string) => base64),
}));

vi.mock("../../src/debug/processing-recorder.js", () => ({
  getRecorder: vi.fn(() => undefined),
}));

const runawayCompletion = {
  choices: [
    {
      finish_reason: "length",
      message: {
        role: "assistant",
        content: "",
        reasoning_content: "I will keep thinking until the token budget is gone.",
      },
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 128, total_tokens: 138 },
};

const successfulCompletion = {
  choices: [
    {
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: "Final answer.",
      },
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
};

describe("chatCompleteDetailed thinking-runaway retry", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createChatCompletion.mockReset();
    mocks.getSettings.mockReset();
    mocks.getSettings.mockResolvedValue(
      makeSettings({
        model: "test-model",
        thinkingEnabled: true,
        reasoningEffort: "high",
        numPredict: 128,
        numCtx: 4096,
      }),
    );
  });

  it("repeats the same LLM request with thinking turned off", async () => {
    mocks.createChatCompletion
      .mockResolvedValueOnce(runawayCompletion)
      .mockResolvedValueOnce(successfulCompletion);

    const { chatCompleteDetailed } = await import("../../src/llm/client.js");
    const result = await chatCompleteDetailed(
      [{ role: "user", content: "Answer directly." }],
      { stop: ["STOP"] },
    );

    expect(result.raw).toBe("Final answer.");
    expect(mocks.createChatCompletion).toHaveBeenCalledTimes(2);

    const first = mocks.createChatCompletion.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    const second = mocks.createChatCompletion.mock.calls[1]![0] as Record<
      string,
      unknown
    >;

    expect(first.reasoning_effort).toBe("high");
    expect(second).not.toHaveProperty("reasoning_effort");
    expect(second.chat_template_kwargs).toEqual({ enable_thinking: false });

    const { reasoning_effort: _reasoningEffort, ...firstWithoutThinking } =
      first;
    expect(second).toEqual({
      ...firstWithoutThinking,
      chat_template_kwargs: { enable_thinking: false },
    });
  });
});
