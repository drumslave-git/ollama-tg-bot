import { describe, expect, it } from "vitest";
import {
  providerChatExtensions,
  shouldUseResponseFormat,
} from "../../src/llm/openai-compat.js";
import {
  getMainReplyResponseFormat,
  MAIN_REPLY_RESPONSE_FORMAT,
} from "../../src/features/completions/index.js";
import { makeSettings } from "../helpers/settings.js";

describe("main reply thinking request policy", () => {
  const thinkingSettings = makeSettings({
    thinkingEnabled: true,
    reasoningEffort: "medium",
    numCtx: 32768,
  });

  it("keeps json_schema for main reply when thinking is on", () => {
    expect(
      shouldUseResponseFormat(
        thinkingSettings,
        false,
        getMainReplyResponseFormat(),
      ),
    ).toBe(true);
  });

  it("keeps json_schema for main reply when thinking is off", () => {
    const settings = makeSettings({ thinkingEnabled: false });
    expect(
      shouldUseResponseFormat(settings, false, MAIN_REPLY_RESPONSE_FORMAT),
    ).toBe(true);
  });

  it("never adds reasoning to the main reply schema", () => {
    const format = getMainReplyResponseFormat();
    expect(format.schema.required).toEqual(["reply"]);
    expect(format.schema.properties).not.toHaveProperty("reasoning");
  });

  it("keeps json_schema for auxiliary passes when thinking is on", () => {
    expect(
      shouldUseResponseFormat(
        thinkingSettings,
        true,
        MAIN_REPLY_RESPONSE_FORMAT,
      ),
    ).toBe(true);
  });

  it("enables chat-template thinking on main and auxiliary when thinking is on", () => {
    const main = providerChatExtensions(thinkingSettings, false);
    expect(main.chat_template_kwargs).toEqual({
      enable_thinking: true,
      reasoning_effort: "medium",
    });
    expect(main.reasoning_effort).toBe("medium");

    const aux = providerChatExtensions(thinkingSettings, true);
    expect(aux.chat_template_kwargs).toEqual({
      enable_thinking: true,
      reasoning_effort: "low",
    });
    expect(aux.reasoning_effort).toBe("low");
  });

  it("disables thinking when think is false on the request", () => {
    const settings = providerChatExtensions(
      { ...thinkingSettings, thinkingEnabled: false },
      false,
    );
    expect(settings.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(settings.reasoning_effort).toBeUndefined();
  });
});
