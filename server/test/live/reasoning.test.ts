import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import { buildBaseSystemPrompt } from "../../src/pipeline/adapters/system-prompt.js";
import { providerChatExtensions } from "../../src/llm/openai-compat.js";
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

// OpenAI-standard reasoning-effort levels. Thinking is turned off via the
// separate `thinkingEnabled` flag (which omits the field), so there is no "off"
// level to test here.
const REASONING_EFFORT_LEVELS = ["low", "medium", "high"] as const;
const EFFORT_LEVEL_PROMPT = "What is 12 + 13? One word in the reply field.";

describe.skipIf(!cfg || !liveReasoningMode())("live: reasoning (thinking enabled)", () => {
  it.each(REASONING_EFFORT_LEVELS)(
    "returns reasoning in JSON content and a usable reply at effort %s",
    async (reasoningEffort) => {
      const settings = makeSettings({ thinkingEnabled: true, reasoningEffort });
      const ext = providerChatExtensions(settings, false);
      expect(ext.reasoning_effort).toBe(reasoningEffort);

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

  it("honors the dashboard thinking-off setting", async () => {
    const client = liveClient(cfg!);
    const result = await runTurn(
      client,
      cfg!.model,
      userTurn("What is 12 + 13? Reply with only the number."),
      { thinkingEnabled: false, numPredict: 128 },
    );

    expect(result.reply).not.toBe("");
    expect(result.reasoning).toBe("");
  });
});

// Reproduces the production "thinking runaway" from processing #13910: with
// thinking on, the model spends its whole token budget in the reasoning channel
// and emits no content, so finish_reason is "length" and the reply is empty. In
// the real trace it burned all 2048 tokens on a 27k-token ambiguous group
// prompt; here a tight budget forces the runaway deterministically without
// rebuilding that context.
//
// This test asserts the behavior we WANT — a usable reply — so it FAILS while
// the bug is present and only passes once the runaway is actually fixed. Do NOT
// relax it to assert the empty-reply shape: a green here must mean the bug is
// gone.
const RUNAWAY_NUM_PREDICT = 128;
const RUNAWAY_PROMPT =
  "Two trains start 300 km apart and move toward each other at 40 and 20 km/h. " +
  "A bird flies back and forth at 100 km/h between them until they meet. " +
  "How far does the bird travel? Reason it out fully before answering.";

describe.skipIf(!cfg || !liveReasoningMode())("live: thinking runaway (bug reproduction)", () => {
  it("still produces a usable reply instead of burning the whole budget on reasoning", async () => {
    const client = liveClient(cfg!);
    const result = await runTurn(
      client,
      cfg!.model,
      userTurn(RUNAWAY_PROMPT),
      { thinkingEnabled: true, numPredict: RUNAWAY_NUM_PREDICT, reasoningEffort: "low" },
    );

    expect(
      result.reply,
      `main reply must not be empty (finish_reason=${result.finishReason}, ` +
        `reasoning chars=${result.reasoning.length}, content chars=${result.content.length})`,
    ).not.toBe("");
    expect(
      hasVisibleTelegramReply(prepareTelegramHtml(result.reply)),
      "reply must be visible Telegram text, not empty markup",
    ).toBe(true);
  });
});
