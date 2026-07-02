import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildTurnContextBlocks,
  type KnownChatUser,
} from "../../src/pipeline/adapters/system-prompt.js";
import { buildLatestTurnMessage } from "../../src/pipeline/chat-messages.js";
import { makeSettings } from "../helpers/settings.js";
import { liveClient, liveConfig, runTurn } from "./helpers.js";

const cfg = liveConfig();

// These turns carry the full group system prompt + a recent-chat window, so a
// slow local model needs generous headroom (the shared default is 180s). The
// replies themselves are short, so we cap generation to keep the ceiling sane.
const TIMEOUT_MS = 360_000;
const NUM_PREDICT = 384;

const alice: KnownChatUser = {
  userId: "111",
  username: "alice",
  firstName: "Alice",
  lastName: null,
  facts: [],
};
const bob: KnownChatUser = {
  userId: "222",
  username: "bob",
  firstName: "Bob",
  lastName: null,
  facts: [],
};
const carol: KnownChatUser = {
  userId: "333",
  username: "carol",
  firstName: "Carol",
  lastName: null,
  facts: [],
};

/** The full group-chat system prompt the bot uses, minus the DB round-trips. */
function groupSystem(): string {
  return buildSystemPrompt({
    settings: makeSettings({ numCtx: 8192, numPredict: 512 }),
    customPrompt: "",
    knownChatUsers: [alice, bob, carol],
  });
}

/** Volatile session context, carried in the user turn like production does. */
function speakerTurnContext(speaker: KnownChatUser): string {
  return buildTurnContextBlocks({
    session: {
      entityId: "-100999",
      now: new Date("2026-07-02T10:10:00.000Z"),
      currentUserId: speaker.userId,
      currentUserTag: `user:${speaker.username}:${speaker.userId}`,
      currentUserLabel: `${speaker.firstName} (@${speaker.username})`,
    },
  });
}

/** One recent-window line in production format: `[ISO] [tag]: text`. */
function windowLine(
  user: KnownChatUser,
  msgId: number,
  text: string,
  minute: number,
): string {
  const at = `2026-07-02T10:0${minute}:00.000Z`;
  return `[${at}] [user:${user.username}:${user.userId} · msg:${msgId}]: ${text}`;
}

/** Build a full group turn (system + user) the way the pipeline does. */
function groupTurn(input: {
  speaker: KnownChatUser;
  body: string;
  window: string[];
  replyToMessageId?: number;
}): ChatCompletionMessageParam[] {
  const turn = buildLatestTurnMessage({
    body: input.body,
    speakerTag: `user:${input.speaker.username}:${input.speaker.userId}`,
    currentSpeaker: {
      userId: input.speaker.userId,
      label: `${input.speaker.firstName} (@${input.speaker.username})`,
    },
    isGroupChat: true,
    recentWindow: input.window.join("\n"),
    turnContextBlocks: speakerTurnContext(input.speaker),
    ...(input.replyToMessageId != null
      ? { replyToMessageId: input.replyToMessageId }
      : {}),
  });
  return [
    { role: "system", content: groupSystem() },
    { role: "user", content: turn },
  ];
}

describe.skipIf(!cfg)("live: group-chat addressing & reply resolution", () => {
  it("directs the reply at the referred-to person, not the speaker who summoned it", async () => {
    // Bob replies to Alice's message asking the bot to help "him" (→ Alice).
    // The bot should address Alice, not answer Bob with a bare "you".
    const client = liveClient(cfg!);
    const messages = groupTurn({
      speaker: bob,
      body: "bot, help him",
      window: [
        windowLine(alice, 100, "I have an issue with my code, it won't compile", 0),
      ],
      replyToMessageId: 100,
    });

    const { reply, finishReason } = await runTurn(client, cfg!.model, messages, {
      numPredict: NUM_PREDICT,
    });
    expect(reply, `empty reply (finish=${finishReason})`).not.toBe("");
    // The person being helped is Alice; the reply must be aimed at her.
    expect(
      /alice/i.test(reply),
      `reply should address Alice (the referred-to person), got: ${reply}`,
    ).toBe(true);
  }, TIMEOUT_MS);

  it("follows the reply pointer to an earlier topic, not the latest window line", async () => {
    // The running window has moved on to lunch, but Bob replies to Alice's
    // earlier deploy-failure message. The bot must answer the deploy topic.
    const client = liveClient(cfg!);
    const messages = groupTurn({
      speaker: bob,
      body: "bot, any idea why?",
      window: [
        windowLine(alice, 100, "the deploy script keeps failing with a timeout error", 0),
        windowLine(bob, 101, "anyway, who's ordering pizza for lunch?", 5),
        windowLine(carol, 102, "I want pepperoni", 6),
      ],
      replyToMessageId: 100,
    });

    const { reply, finishReason } = await runTurn(client, cfg!.model, messages, {
      numPredict: NUM_PREDICT,
    });
    expect(reply, `empty reply (finish=${finishReason})`).not.toBe("");
    expect(
      /deploy|script|timeout|fail|log/i.test(reply),
      `reply should be about the replied-to deploy topic, got: ${reply}`,
    ).toBe(true);
    expect(
      /pizza|pepperoni|lunch/i.test(reply),
      `reply should NOT answer the lunch topic, got: ${reply}`,
    ).toBe(false);
  }, TIMEOUT_MS);

  it("attributes who-said-what correctly from the speaker tags", async () => {
    // Carol asks what database Alice uses; the answer is in Alice's tagged line,
    // not Bob's. The bot must not cross the two speakers' statements.
    const client = liveClient(cfg!);
    const messages = groupTurn({
      speaker: carol,
      body: "bot, what database does alice use?",
      window: [
        windowLine(alice, 100, "honestly I use Postgres for everything", 0),
        windowLine(bob, 101, "I prefer MySQL myself", 2),
      ],
    });

    const { reply, finishReason } = await runTurn(client, cfg!.model, messages, {
      numPredict: NUM_PREDICT,
    });
    expect(reply, `empty reply (finish=${finishReason})`).not.toBe("");
    expect(
      /postgres/i.test(reply),
      `reply should attribute Postgres to Alice, got: ${reply}`,
    ).toBe(true);
    expect(
      /mysql/i.test(reply),
      `reply should not misattribute Bob's MySQL to Alice, got: ${reply}`,
    ).toBe(false);
  }, TIMEOUT_MS);
});
