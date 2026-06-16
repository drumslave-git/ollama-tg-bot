import { describe, expect, it } from "vitest";
import {
  providerChatExtensions,
  shouldUseResponseFormat,
} from "../../src/llm/openai-compat.js";
import { MAIN_REPLY_RESPONSE_FORMAT } from "../../src/prompts/response-format.js";
import { makeSettings } from "../helpers/settings.js";

describe("main reply thinking request policy", () => {
  const thinkingSettings = makeSettings({
    thinkingEnabled: true,
    reasoningEffort: "medium",
    numCtx: 32768,
  });

  it("omits json_schema for main reply when thinking is on", () => {
    expect(
      shouldUseResponseFormat(
        thinkingSettings,
        false,
        MAIN_REPLY_RESPONSE_FORMAT,
      ),
    ).toBe(false);
  });

  it("keeps json_schema for main reply when thinking is off", () => {
    const settings = makeSettings({ thinkingEnabled: false });
    expect(
      shouldUseResponseFormat(settings, false, MAIN_REPLY_RESPONSE_FORMAT),
    ).toBe(true);
  });

  it("always keeps json_schema for auxiliary passes", () => {
    expect(
      shouldUseResponseFormat(
        thinkingSettings,
        true,
        MAIN_REPLY_RESPONSE_FORMAT,
      ),
    ).toBe(true);
  });

  it("enables chat-template thinking on main reply only", () => {
    const main = providerChatExtensions(thinkingSettings, false);
    expect(main.chat_template_kwargs).toEqual({
      enable_thinking: true,
      reasoning_effort: "medium",
    });
    expect(main.reasoning_effort).toBe("medium");

    const aux = providerChatExtensions(thinkingSettings, true);
    expect(aux.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(aux.reasoning_effort).toBeUndefined();
  });
});
