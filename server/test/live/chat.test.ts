import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import { buildBaseSystemPrompt } from "../../src/prompts.js";
import { hasVisibleTelegramReply, prepareTelegramHtml } from "../../src/telegram/html.js";
import { makeSettings } from "../helpers/settings.js";
import { liveClient, liveConfig, runTurn } from "./helpers.js";

const cfg = liveConfig();

const SYSTEM = buildBaseSystemPrompt(makeSettings({ numCtx: 8192, numPredict: 512 }));

function userTurn(text: string): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `[user:georg:123 said] ${text}` },
  ];
}

describe.skipIf(!cfg)("live: chat round-trip", () => {
  it("returns a usable JSON reply in message.content for a greeting", async () => {
    const client = liveClient(cfg!);
    const result = await runTurn(client, cfg!.model, userTurn("hello there!"));

    expect(result.content, "content should not be empty").not.toBe("");
    expect(result.reply, "extracted reply should not be empty").not.toBe("");
    expect(hasVisibleTelegramReply(prepareTelegramHtml(result.reply))).toBe(true);
  });

  it("handles several greetings in different languages", async () => {
    const client = liveClient(cfg!);
    const prompts = ["привет", "hello", "здаров", "аллоха"];
    for (const p of prompts) {
      const result = await runTurn(client, cfg!.model, userTurn(p));
      expect(result.reply, `empty reply for "${p}" (finish=${result.finishReason})`).not.toBe(
        "",
      );
    }
  });

  it("keeps the answer in content (not only reasoning) with thinking off", async () => {
    const client = liveClient(cfg!);
    const result = await runTurn(
      client,
      cfg!.model,
      userTurn("Say a one-word greeting."),
      { thinkingEnabled: false },
    );
    expect(result.reply).not.toBe("");
  });

  it("continues a short conversation with prior history", async () => {
    const client = liveClient(cfg!);
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM },
      { role: "user", content: "[user:georg:123 said] my name is Georg" },
      { role: "assistant", content: '{"reply":"Nice to meet you, Georg!"}' },
      { role: "user", content: "[user:georg:123 said] what is my name?" },
    ];
    const result = await runTurn(client, cfg!.model, messages);
    expect(result.reply).not.toBe("");
    expect(result.reply.toLowerCase()).toContain("georg");
  });
});
