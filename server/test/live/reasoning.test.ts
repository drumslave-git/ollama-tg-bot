import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import { buildBaseSystemPrompt } from "../../src/pipeline/adapters/system-prompt.js";
import {
  providerChatExtensions,
  shouldUseResponseFormat,
} from "../../src/llm/openai-compat.js";
import { getMainReplyResponseFormat } from "@llm-tg-bot/modules-completions";
import { hasVisibleTelegramReply, prepareTelegramHtml } from "../../src/telegram/html.js";
import { makeSettings } from "../helpers/settings.js";
import { liveClient, liveConfig, liveReasoningMode, runTurn } from "./helpers.js";

const cfg = liveConfig();

const SYSTEM = buildBaseSystemPrompt(
  makeSettings({ numCtx: 8192, numPredict: 512, thinkingEnabled: true }),
);

function userTurn(text: string): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `[user:georg:123 said] ${text}` },
  ];
}

describe.skipIf(!cfg || !liveReasoningMode())("live: reasoning (thinking enabled)", () => {
  it("uses json_schema with reasoning field on main reply while thinking is on", () => {
    const settings = makeSettings({ thinkingEnabled: true, reasoningEffort: "medium" });
    const format = getMainReplyResponseFormat(true);
    expect(
      shouldUseResponseFormat(settings, false, format),
    ).toBe(true);
    expect(format.schema.required).toContain("reasoning");
    expect(providerChatExtensions(settings, false).chat_template_kwargs).toEqual({
      enable_thinking: true,
      reasoning_effort: "medium",
    });
  });

  it("returns reasoning in JSON content and a usable reply", async () => {
    const client = liveClient(cfg!);
    const result = await runTurn(
      client,
      cfg!.model,
      userTurn("What is 12 + 13? One word in the reply field."),
      { thinkingEnabled: true, numPredict: 512 },
    );

    expect(result.reply, "reply should not be empty").not.toBe("");
    expect(hasVisibleTelegramReply(prepareTelegramHtml(result.reply))).toBe(true);
    expect(
      result.reasoning,
      "backend should return chain-of-thought in a separate reasoning field",
    ).not.toBe("");
    expect(result.reasoning.length).toBeGreaterThan(20);
    expect(result.content, "final answer should stay in content").not.toBe("");
  });

  it("returns separate reasoning for an alive-check prompt", async () => {
    const client = liveClient(cfg!);
    const result = await runTurn(
      client,
      cfg!.model,
      userTurn("Ihar, are you alive!"),
      { thinkingEnabled: true, numPredict: 512 },
    );

    expect(result.reply).not.toBe("");
    expect(result.reasoning.length).toBeGreaterThan(20);
  });

  it("returns reasoning for a creative main-reply turn", async () => {
    const client = liveClient(cfg!);
    const result = await runTurn(
      client,
      cfg!.model,
      userTurn("Tell me a one-sentence joke."),
      { thinkingEnabled: true, numPredict: 1024 },
    );

    expect(result.reply).not.toBe("");
    expect(result.reasoning.length).toBeGreaterThan(20);
  });
});
