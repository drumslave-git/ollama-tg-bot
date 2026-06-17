import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import { toOpenAiResponseFormat } from "@llm-tg-bot/modules-utils";
import { buildBaseSystemPrompt } from "../../src/pipeline/adapters/system-prompt.js";
import {
  parseAssistantMessage,
  providerChatExtensions,
  shouldUseResponseFormat,
} from "../../src/llm/openai-compat.js";
import { MAIN_REPLY_RESPONSE_FORMAT } from "@llm-tg-bot/modules-completions";
import { hasVisibleTelegramReply, prepareTelegramHtml } from "../../src/telegram/html.js";
import { makeSettings } from "../helpers/settings.js";
import { liveClient, liveConfig, liveReasoningMode, runTurn } from "./helpers.js";

const cfg = liveConfig();

const SYSTEM = buildBaseSystemPrompt(makeSettings({ numCtx: 8192, numPredict: 512 }));

function userTurn(text: string): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `[user:georg:123 said] ${text}` },
  ];
}

describe.skipIf(!cfg || !liveReasoningMode())("live: reasoning (thinking enabled)", () => {
  it("omits json_schema on main reply while thinking is on", () => {
    const settings = makeSettings({ thinkingEnabled: true, reasoningEffort: "medium" });
    expect(
      shouldUseResponseFormat(settings, false, MAIN_REPLY_RESPONSE_FORMAT),
    ).toBe(false);
    expect(providerChatExtensions(settings, false).chat_template_kwargs).toEqual({
      enable_thinking: true,
      reasoning_effort: "medium",
    });
  });

  it("regression: json_schema suppresses separate reasoning on reasoning backends", async () => {
    const client = liveClient(cfg!);
    const settings = makeSettings({ thinkingEnabled: true, reasoningEffort: "medium" });
    const completion = await client.chat.completions.create({
      model: cfg!.model,
      messages: userTurn("Ігарь, ти живий!"),
      stream: false,
      max_completion_tokens: 512,
      temperature: settings.temperature,
      top_p: settings.topP,
      ...providerChatExtensions(settings, false),
      response_format: toOpenAiResponseFormat(MAIN_REPLY_RESPONSE_FORMAT),
    });
    const parsed = parseAssistantMessage(completion.choices[0]);
    expect(parsed.content).not.toBe("");
    expect(
      parsed.reasoning,
      "forcing json_schema while thinking is on should not be used in production",
    ).toBe("");
  });

  it("returns separate reasoning and a usable JSON reply", async () => {
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

  it("returns separate reasoning for the Ukrainian alive-check prompt", async () => {
    const client = liveClient(cfg!);
    const result = await runTurn(
      client,
      cfg!.model,
      userTurn("Ігарь, ти живий!"),
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
