import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import { buildBaseSystemPrompt } from "../../src/pipeline/adapters/system-prompt.js";
import {
  providerChatExtensions,
  shouldUseResponseFormat,
} from "../../src/llm/openai-compat.js";
import { getMainReplyResponseFormat } from "../../src/features/completions/index.js";
import { hasVisibleTelegramReply, prepareTelegramHtml } from "../../src/telegram/html.js";
import { makeSettings } from "../helpers/settings.js";
import { liveClient, liveConfig, liveReasoningMode, runTurn } from "./helpers.js";

const cfg = liveConfig();

const NUM_PREDICT = 2048;
const SYSTEM = buildBaseSystemPrompt(
  makeSettings({ numCtx: 8192, numPredict: NUM_PREDICT, thinkingEnabled: true }),
);

function userTurn(text: string): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `[user:georg:123 said] ${text}` },
  ];
}

const REASONING_EFFORT_LEVELS = ["none", "low", "medium", "high"] as const;
const EFFORT_LEVEL_PROMPT = "What is 12 + 13? One word in the reply field.";

describe.skipIf(!cfg || !liveReasoningMode())("live: reasoning (thinking enabled)", () => {
  it("uses json_schema without a reasoning field on main reply while thinking is on", () => {
    const settings = makeSettings({ thinkingEnabled: true, reasoningEffort: "medium" });
    const format = getMainReplyResponseFormat();
    expect(
      shouldUseResponseFormat(settings, false, format),
    ).toBe(true);
    expect(format.schema.required).not.toContain("reasoning");
    expect(providerChatExtensions(settings, false).chat_template_kwargs).toEqual({
      enable_thinking: true,
      reasoning_effort: "medium",
    });
  });

  it.each(REASONING_EFFORT_LEVELS)(
    "returns reasoning in JSON content and a usable reply at effort %s",
    async (reasoningEffort) => {
      const settings = makeSettings({ thinkingEnabled: true, reasoningEffort });
      const ext = providerChatExtensions(settings, false);
      if (reasoningEffort === "none") {
        expect(ext.reasoning_effort).toBeUndefined();
        expect(ext.chat_template_kwargs?.reasoning_effort).toBeUndefined();
      } else {
        expect(ext.reasoning_effort).toBe(reasoningEffort);
        expect(ext.chat_template_kwargs?.reasoning_effort).toBe(reasoningEffort);
      }

      const client = liveClient(cfg!);
      const result = await runTurn(
        client,
        cfg!.model,
        userTurn(EFFORT_LEVEL_PROMPT),
        { thinkingEnabled: true, numPredict: NUM_PREDICT, reasoningEffort },
      );

      expect(result.reply, `reply should not be empty (effort=${reasoningEffort})`).not.toBe("");
      expect(hasVisibleTelegramReply(prepareTelegramHtml(result.reply))).toBe(true);
      expect(
        result.reasoning,
        `backend should return chain-of-thought at effort=${reasoningEffort}`,
      ).not.toBe("");
      expect(result.reasoning.length).toBeGreaterThan(20);
      expect(result.content, "final answer should stay in content").not.toBe("");
    },
  );

  it("returns separate reasoning for an alive-check prompt", async () => {
    const client = liveClient(cfg!);
    const result = await runTurn(
      client,
      cfg!.model,
      userTurn("Ihar, are you alive!"),
      { thinkingEnabled: true, numPredict: NUM_PREDICT },
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
      { thinkingEnabled: true, numPredict: NUM_PREDICT },
    );

    expect(result.reply).not.toBe("");
    expect(result.reasoning.length).toBeGreaterThan(20);
  });
});
