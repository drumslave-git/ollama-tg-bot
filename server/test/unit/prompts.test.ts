import { describe, expect, it } from "vitest";
import {
  BASE_SYSTEM_PROMPT_CORE,
  buildBaseSystemPrompt,
  buildExplainSystemPrompt,
  buildSystemPrompt,
  buildTurnContextBlocks,
} from "../../src/pipeline/adapters/system-prompt.js";
import { READ_PAGE_TOOL_NAME } from "../../src/features/link-fetch/index.js";
import { SEARCH_WEB_TOOL_NAME } from "../../src/features/web-search/index.js";
import {
  HISTORY_GET_IN_RANGE_TOOL_NAME,
  HISTORY_GET_MESSAGES_TOOL_NAME,
  HISTORY_SEARCH_TOOL_NAME,
  HISTORY_TODAY_GET_LATEST_TOOL_NAME,
  HISTORY_TODAY_SEARCH_TOOL_NAME,
} from "../../src/features/history/mcp-tools.js";
import { HISTORY_SUMMARIES_SEARCH_TOOL_NAME } from "../../src/features/summaries/mcp-tools.js";
import {
  MEMORY_ENTRIES_GET_TOOL_NAME,
  MEMORY_ENTRIES_SEARCH_TOOL_NAME,
  MEMORY_GET_TOOL_NAME,
  MEMORY_SAVE_TOOL_NAME,
  MEMORY_SEARCH_TOOL_NAME,
} from "../../src/features/memory/mcp-tools.js";
import {
  TASKS_CREATE_TOOL_NAME,
  TASKS_DELETE_TOOL_NAME,
  TASKS_GET_TOOL_NAME,
  TASKS_LIST_TOOL_NAME,
  TASKS_SEARCH_TOOL_NAME,
  TASKS_UPDATE_TOOL_NAME,
} from "../../src/features/tasks/mcp-tools.js";
import { BROWSE_WEB_TOOL_NAME } from "../../src/features/web-browse/mcp-tools.js";
import { IMAGE_GENERATE_TOOL_NAME } from "../../src/features/image-gen/mcp-tools.js";
import { config } from "../../src/config/index.js";
import { makeSettings } from "../helpers/settings.js";

describe("buildBaseSystemPrompt", () => {
  it("includes the core prompt, a length hint, and the reply format", () => {
    const prompt = buildBaseSystemPrompt(makeSettings({ numPredict: 512 }));
    expect(prompt).toContain(BASE_SYSTEM_PROMPT_CORE);
    expect(prompt).toContain("plain text");
    expect(prompt).toContain("512");
  });
});

describe("buildSystemPrompt", () => {
  it("appends a custom personality prompt", () => {
    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "You are a pirate.",
    });
    expect(prompt).toContain("Additional instructions:");
    expect(prompt).toContain("You are a pirate.");
  });

  it("is cache-stable: no session block, timestamps, or mood in the system prompt", () => {
    // Volatile per-turn values live in buildTurnContextBlocks (user message) so
    // the system prompt stays byte-identical between turns for prompt caching.
    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "You are a pirate.",
      ownerUsername: "georg",
      ownerUserId: "42",
    });
    // The core text may MENTION the [SESSION] block (it tells the model where
    // to find it), but the block's volatile lines must not be present.
    expect(prompt).not.toContain("utc now:");
    expect(prompt).not.toContain("current time:");
    expect(prompt).not.toContain("current speaker id:");
    expect(prompt).not.toContain("Current mood");

    const again = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "You are a pirate.",
      ownerUsername: "georg",
      ownerUserId: "42",
    });
    expect(again).toBe(prompt);
  });

  it("includes the owner section when provided", () => {
    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      ownerUsername: "georg",
      ownerUserId: "42",
    });
    expect(prompt).toContain("Bot owner");
    expect(prompt).toContain("@georg");
  });

  it("lists known chat participants with their stored facts so names/nicknames resolve", () => {
    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      knownChatUsers: [
        {
          userId: "1000001",
          username: "alice",
          firstName: "Alice",
          lastName: null,
          facts: ["Goes by Ace", "Works in delivery/sales"],
        },
      ],
    });
    expect(prompt).toContain("## Known Telegram users in this chat");
    expect(prompt).toContain("Alice (@alice)");
    // The learned alias must sit under the directory entry, indented as a fact —
    // this is what lets the model map "Ace" to this participant.
    expect(prompt).toContain("  - Goes by Ace");
    expect(prompt).toContain("  - Works in delivery/sales");
  });

  it("always ends with the reply format spec", () => {
    const prompt = buildSystemPrompt({ settings: makeSettings(), customPrompt: "" });
    expect(prompt).toContain("plain text");
    expect(prompt).not.toContain("LANGUAGE (critical");
    expect(prompt).not.toContain("Respond with JSON only");
    expect(prompt.trimEnd().endsWith("you do not have to use tags at all.")).toBe(true);
  });

  it("adds the Tools section only when tools are enabled", () => {
    const withoutTools = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
    });
    expect(withoutTools).not.toContain("## Tools");
    expect(withoutTools).not.toContain(READ_PAGE_TOOL_NAME);

    const withTools = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      enabledToolNames: [READ_PAGE_TOOL_NAME, SEARCH_WEB_TOOL_NAME],
    });
    expect(withTools).toContain("## Tools");
    expect(withTools).toContain(READ_PAGE_TOOL_NAME);
    expect(withTools).toContain(SEARCH_WEB_TOOL_NAME);
  });

  it("lists every enabled MCP tool from the shared guidance registry", () => {
    const toolNames = [
      HISTORY_TODAY_GET_LATEST_TOOL_NAME,
      HISTORY_TODAY_SEARCH_TOOL_NAME,
      HISTORY_SUMMARIES_SEARCH_TOOL_NAME,
      HISTORY_GET_MESSAGES_TOOL_NAME,
      HISTORY_GET_IN_RANGE_TOOL_NAME,
      HISTORY_SEARCH_TOOL_NAME,
      MEMORY_GET_TOOL_NAME,
      MEMORY_SEARCH_TOOL_NAME,
      MEMORY_ENTRIES_SEARCH_TOOL_NAME,
      MEMORY_ENTRIES_GET_TOOL_NAME,
      MEMORY_SAVE_TOOL_NAME,
      TASKS_CREATE_TOOL_NAME,
      TASKS_UPDATE_TOOL_NAME,
      TASKS_DELETE_TOOL_NAME,
      TASKS_GET_TOOL_NAME,
      TASKS_LIST_TOOL_NAME,
      TASKS_SEARCH_TOOL_NAME,
      READ_PAGE_TOOL_NAME,
      SEARCH_WEB_TOOL_NAME,
      BROWSE_WEB_TOOL_NAME,
      IMAGE_GENERATE_TOOL_NAME,
    ];
    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      enabledToolNames: toolNames,
    });

    for (const toolName of toolNames) {
      expect(prompt).toContain(`- ${toolName}(`);
    }
  });

  it("adds a concrete memory_save protocol only when that tool is enabled", () => {
    const withMemory = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      enabledToolNames: ["memory_save"],
    });
    expect(withMemory).toMatch(/MEMORY PROTOCOL/i);
    expect(withMemory).toMatch(/remember.*save.*note.*don't forget/i);
    expect(withMemory).toMatch(/current speaker id/i);
    expect(withMemory).toMatch(/\[user:name:id\]/i);
    expect(withMemory).toMatch(/one concise fact per call/i);
    // Must spell out that a written acknowledgment is not a save — gemma
    // otherwise replies "saved" without emitting the memory_save call.
    expect(withMemory).toMatch(/Acknowledging memory without the tool stores nothing/i);

    const withoutMemory = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      enabledToolNames: [READ_PAGE_TOOL_NAME],
    });
    expect(withoutMemory).not.toMatch(/MEMORY PROTOCOL/i);
  });
});

describe("buildTurnContextBlocks", () => {
  it("gives current time as a local wall clock for task scheduling, plus UTC ISO for history ranges", () => {
    // The block must carry a NAMED local wall clock the model computes relative
    // times from, not only a raw UTC ISO value (which previously made it
    // miscompute "in 5 min"). Compute the expected local clock the same way the
    // prompt does so the test holds under any machine TZ.
    const now = new Date("2026-06-30T15:24:00.000Z");
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const localClock = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;

    const block = buildTurnContextBlocks({
      session: { entityId: "chat-1", now },
    });
    expect(block).toContain("[SESSION]");
    // Local wall clock line is the `current time:` terminator, names the zone,
    // and steers relative-time math to it.
    expect(block).toContain(`current time: ${localClock}`);
    expect(block).toContain(`${config.timezone}`);
    expect(block).toMatch(/tasks_\*[^\n]*timezone/i);
    // UTC ISO is still present for history tool ranges.
    expect(block).toContain("utc now: 2026-06-30T15:24:00.000Z");
  });

  it("surfaces the current speaker's id, tag, and label", () => {
    const block = buildTurnContextBlocks({
      session: {
        entityId: "dm-1",
        now: new Date(),
        currentUserId: "312973896",
        currentUserTag: "user:alice:312973896",
        currentUserLabel: "Alice (@alice)",
      },
    });
    expect(block).toContain("current speaker id: 312973896");
    expect(block).toContain("[user:alice:312973896]");
    expect(block).toContain("Alice (@alice)");
  });

  it("carries the required chat language when provided", () => {
    const block = buildTurnContextBlocks({
      requiredLanguage: "Portuguese",
      session: { entityId: "dm-1", now: new Date() },
    });
    expect(block).toContain("[REQUIRED LANGUAGE]");
    expect(block).toContain("Portuguese");
    expect(block).toMatch(/overrides.*incoming message/i);
  });

  it("notes owner status and a replied-to task in the session block", () => {
    const block = buildTurnContextBlocks({
      session: {
        entityId: "dm-1",
        now: new Date(),
        currentUserId: "42",
        currentUserIsOwner: true,
        repliedTask: { id: 7, instruction: "ask how they are doing" },
      },
    });
    expect(block).toContain("OWNER");
    expect(block).toContain("tasks_update");
    expect(block).toContain("#7");
  });

  it("carries the mood block when a mood is set", () => {
    const block = buildTurnContextBlocks({
      mood: { happiness: 5, energy: 5, sociability: 5, sarcasm: 5 } as never,
    });
    expect(block).toContain("[CURRENT MOOD");
  });

  it("is empty when there is no session and no mood", () => {
    expect(buildTurnContextBlocks({})).toBe("");
  });
});

describe("buildExplainSystemPrompt", () => {
  it("embeds the execution trace and the active personality, and stays out of character", () => {
    const prompt = buildExplainSystemPrompt({
      settings: makeSettings(),
      activePersonalityName: "Pirate",
      activePersonalityPrompt: "Talk like a pirate.",
      traceText: "## Phases\n### Main reply · ok\n  generated reply\n",
    });
    expect(prompt).toContain("debugging assistant");
    expect(prompt).toContain("Do NOT roleplay");
    expect(prompt).toContain("## Execution trace");
    expect(prompt).toContain("### Main reply · ok");
    expect(prompt).toContain("Talk like a pirate.");
  });

  it("does not pull in history tools or a session block", () => {
    const prompt = buildExplainSystemPrompt({
      settings: makeSettings(),
      activePersonalityName: null,
      activePersonalityPrompt: null,
      traceText: "trace body",
    });
    expect(prompt).not.toContain("[SESSION]");
    expect(prompt).not.toContain(HISTORY_TODAY_GET_LATEST_TOOL_NAME);
    expect(prompt).toContain("trace body");
  });
});
