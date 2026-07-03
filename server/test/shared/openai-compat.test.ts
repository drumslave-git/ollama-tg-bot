import { describe, expect, it } from "vitest";
import {
  boundedRetryEffort,
  isThinkingRunaway,
  parseAssistantMessage,
  providerChatExtensions,
  providerRequestExtensions,
  shouldUseResponseFormat,
} from "../../src/shared/openai-compat.js";
import { makeProviderSettings } from "./helpers/provider-settings.js";

type Choice = Parameters<typeof parseAssistantMessage>[0];

function choice(message: Record<string, unknown>): Choice {
  return { message } as unknown as Choice;
}

describe("providerChatExtensions", () => {
  it("maps provider options from settings", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ numCtx: 8192 }),
      false,
    );
    expect(ext.options).toEqual({
      num_ctx: 8192,
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
  });

  it("passes through the max reasoning effort level", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "max" }),
      false,
    );
    expect(ext.reasoning_effort).toBe("max");
  });

  it("omits reasoning_effort when effort is none", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "none" }),
      false,
    );
    expect(ext.reasoning_effort).toBeUndefined();
  });

  it("uses low reasoning effort for auxiliary side passes when thinking is on", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "high" }),
      true,
    );
    expect(ext.reasoning_effort).toBe("low");
  });

  it("never emits provider-specific chat_template_kwargs", () => {
    const ext = providerChatExtensions(
      makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "high" }),
      false,
    );
    expect(ext).not.toHaveProperty("chat_template_kwargs");
  });
});

describe("isThinkingRunaway", () => {
  it("flags empty content with reasoning that stopped on length", () => {
    expect(
      isThinkingRunaway({ content: "", reasoning: "long chain" }, "length"),
    ).toBe(true);
  });

  it("ignores whitespace-only content", () => {
    expect(
      isThinkingRunaway({ content: "   ", reasoning: "chain" }, "length"),
    ).toBe(true);
  });

  it("does not flag when content is present", () => {
    expect(
      isThinkingRunaway({ content: "hi", reasoning: "chain" }, "length"),
    ).toBe(false);
  });

  it("does not flag when it stopped normally", () => {
    expect(
      isThinkingRunaway({ content: "", reasoning: "chain" }, "stop"),
    ).toBe(false);
  });

  it("does not flag when there was no reasoning", () => {
    expect(isThinkingRunaway({ content: "", reasoning: "" }, "length")).toBe(
      false,
    );
  });
});

describe("boundedRetryEffort", () => {
  it("lowers effort one step but never below low", () => {
    expect(boundedRetryEffort("max")).toBe("high");
    expect(boundedRetryEffort("high")).toBe("medium");
    expect(boundedRetryEffort("medium")).toBe("low");
    expect(boundedRetryEffort("low")).toBe("low");
    expect(boundedRetryEffort("none")).toBe("low");
  });
});

describe("shouldUseResponseFormat", () => {
  const format = {
    name: "test",
    schema: { type: "object", properties: {}, required: [] },
  };

  it("uses schema for auxiliary passes when thinking is on", () => {
    expect(
      shouldUseResponseFormat(
        makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "high" }),
        true,
        format,
      ),
    ).toBe(true);
  });

  it("uses schema for auxiliary passes when thinking is off", () => {
    expect(
      shouldUseResponseFormat(
        makeProviderSettings({ thinkingEnabled: false }),
        true,
        format,
      ),
    ).toBe(true);
  });

  it("uses schema for main reply when thinking is on", () => {
    expect(
      shouldUseResponseFormat(
        makeProviderSettings({ thinkingEnabled: true, reasoningEffort: "medium" }),
        false,
        format,
      ),
    ).toBe(true);
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
