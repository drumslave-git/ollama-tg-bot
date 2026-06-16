import { describe, expect, it } from "vitest";
import {
  parseAssistantMessage,
  providerChatExtensions,
  providerRequestExtensions,
  shouldUseResponseFormat,
} from "../src/openai-compat.js";
import { makeProviderSettings } from "./helpers/provider-settings.js";

type Choice = Parameters<typeof parseAssistantMessage>[0];

function choice(message: Record<string, unknown>): Choice {
  return { message } as unknown as Choice;
}

describe("providerChatExtensions", () => {
  it("maps provider options from settings", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ numCtx: 8192, topK: 50, repeatPenalty: 1.2 }),
      false,
    );
    expect(ext.options).toEqual({
      num_ctx: 8192,
      top_k: 50,
      repeat_penalty: 1.2,
      skip_special_tokens: false,
    });
  });

  it("omits reasoning_effort when thinking is disabled", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ thinkingEnabled: false, reasoningEffort: "high" }),
      false,
    );
    expect(ext.reasoning_effort).toBeUndefined();
  });

  it("sends reasoning_effort when thinking is enabled", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "high" }),
      false,
    );
    expect(ext.reasoning_effort).toBe("high");
    expect(ext.chat_template_kwargs).toEqual({
      enable_thinking: true,
      reasoning_effort: "high",
    });
  });

  it("sends enable_thinking without reasoning_effort when effort is none", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "none" }),
      false,
    );
    expect(ext.reasoning_effort).toBeUndefined();
    expect(ext.chat_template_kwargs).toEqual({ enable_thinking: true });
  });

  it("forces reasoning off for auxiliary side passes", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "high" }),
      true,
    );
    expect(ext.reasoning_effort).toBeUndefined();
    expect(ext.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("disables chat template thinking when thinking is off", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ thinkingEnabled: false, reasoningEffort: "high" }),
      false,
    );
    expect(ext.reasoning_effort).toBeUndefined();
    expect(ext.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});

describe("shouldUseResponseFormat", () => {
  const format = {
    name: "test",
    schema: { type: "object", properties: {}, required: [] },
  };

  it("uses schema for auxiliary passes even when thinking is on", () => {
    expect(
      shouldUseResponseFormat(
        makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "high" }),
        true,
        format,
      ),
    ).toBe(true);
  });

  it("omits schema for main reply when thinking is on", () => {
    expect(
      shouldUseResponseFormat(
        makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "medium" }),
        false,
        format,
      ),
    ).toBe(false);
  });

  it("uses schema for main reply when thinking is off", () => {
    expect(
      shouldUseResponseFormat(
        makeProviderSettings({ thinkingEnabled: false }),
        false,
        format,
      ),
    ).toBe(true);
  });

  it("returns false when no format is provided", () => {
    expect(
      shouldUseResponseFormat(
        makeProviderSettings({ thinkingEnabled: false }),
        false,
        undefined,
      ),
    ).toBe(false);
  });
});

describe("providerRequestExtensions", () => {
  it("returns only the options bag (no reasoning_effort)", () => {
    const ext = providerRequestExtensions(
      makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "high" }),
    );
    expect(ext).toEqual({
      options: {
        num_ctx: 4096,
        top_k: 40,
        repeat_penalty: 1.1,
        skip_special_tokens: false,
      },
    });
  });
});

describe("parseAssistantMessage", () => {
  it("reads plain string content", () => {
    expect(parseAssistantMessage(choice({ content: "  hi  " }))).toEqual({
      content: "hi",
      reasoning: "",
    });
  });

  it("joins array content parts", () => {
    const result = parseAssistantMessage(
      choice({
        content: [
          { type: "text", text: "one" },
          { type: "text", text: "two" },
        ],
      }),
    );
    expect(result.content).toBe("one\ntwo");
  });

  it("prefers reasoning_content over reasoning", () => {
    const result = parseAssistantMessage(
      choice({ content: "answer", reasoning_content: "rc", reasoning: "r" }),
    );
    expect(result.reasoning).toBe("rc");
  });

  it("falls back to reasoning when reasoning_content absent", () => {
    const result = parseAssistantMessage(
      choice({ content: "answer", reasoning: "r" }),
    );
    expect(result.reasoning).toBe("r");
  });

  it("joins array reasoning_content parts", () => {
    const result = parseAssistantMessage(
      choice({
        content: "answer",
        reasoning_content: [{ text: "step one" }, { text: "step two" }],
      }),
    );
    expect(result.reasoning).toBe("step one\nstep two");
  });

  it("falls back to refusal text when content is empty", () => {
    const result = parseAssistantMessage(
      choice({ content: "", refusal: "cannot help" }),
    );
    expect(result.content).toBe("cannot help");
  });

  it("returns empty fields for a missing choice", () => {
    expect(parseAssistantMessage(undefined)).toEqual({
      content: "",
      reasoning: "",
    });
  });
});
