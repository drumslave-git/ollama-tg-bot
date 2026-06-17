import { describe, expect, it } from "vitest";
import {
  providerChatExtensions,
  shouldUseResponseFormat,
} from "../../src/llm/openai-compat.js";
import {
  getMainReplyResponseFormat,
  MAIN_REPLY_RESPONSE_FORMAT,
} from "@llm-tg-bot/modules-completions";
import {
  REASONING_JSON_FIELD,
  withReasoningInSchema,
} from "@llm-tg-bot/modules-utils";
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
        getMainReplyResponseFormat(true),
      ),
    ).toBe(true);
  });

  it("keeps json_schema for main reply when thinking is off", () => {
    const settings = makeSettings({ thinkingEnabled: false });
    expect(
      shouldUseResponseFormat(settings, false, MAIN_REPLY_RESPONSE_FORMAT),
    ).toBe(true);
  });

  it("adds reasoning to the main reply schema when thinking is on", () => {
    const format = getMainReplyResponseFormat(true);
    expect(format.schema.required).toContain(REASONING_JSON_FIELD);
    expect(format.schema.required).toContain("reply");
  });

  it("keeps json_schema for auxiliary passes when thinking is on", () => {
    expect(
      shouldUseResponseFormat(
        thinkingSettings,
        true,
        withReasoningInSchema(MAIN_REPLY_RESPONSE_FORMAT),
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
});
