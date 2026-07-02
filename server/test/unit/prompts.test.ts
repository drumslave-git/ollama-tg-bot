import { describe, expect, it } from "vitest";
import {
  BASE_SYSTEM_PROMPT_CORE,
  buildBaseSystemPrompt,
  buildExplainSystemPrompt,
  buildSystemPrompt,
  buildToolRoundSystemPrompt,
  extractSessionBlock,
} from "../../src/pipeline/adapters/system-prompt.js";
import { FETCH_LINK_TOOL_NAME } from "../../src/features/link-fetch/index.js";
import { SEARCH_WEB_TOOL_NAME } from "../../src/features/web-search/index.js";
import { HISTORY_TODAY_GET_LATEST_TOOL_NAME } from "../../src/features/history/mcp-tools.js";
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

    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      entityId: "chat-1",
      now,
    });
    // Local wall clock line is the `current time:` terminator, names the zone,
    // and steers relative-time math to it.
    expect(prompt).toContain(`current time: ${localClock}`);
    expect(prompt).toContain(`${config.timezone}`);
    expect(prompt).toMatch(/tasks_\*[^\n]*timezone/i);
    // UTC ISO is still present for history tool ranges.
    expect(prompt).toContain("utc now: 2026-06-30T15:24:00.000Z");

    // The tool-loop reuse path must capture BOTH lines (the regex terminates on
    // `current time:`, so the UTC line has to sit above it).
    const block = extractSessionBlock(prompt);
    expect(block).toContain("utc now: 2026-06-30T15:24:00.000Z");
    expect(block).toContain(`current time: ${localClock}`);
  });

  it("does not expose a group memory id in the session block", () => {
    // Group memory was removed — only user and general scopes remain, so the
    // session block no longer carries a group id for the memory tools.
    const group = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      isGroupChat: true,
      entityId: "chat-1",
      groupChatId: "555",
    });
    expect(group).not.toContain("group id:");
    expect(group).not.toContain("This group's culture and how to behave here");

    const dm = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      isGroupChat: false,
      entityId: "dm-1",
    });
    expect(dm).not.toContain("group id:");
  });

  it("surfaces the current speaker's id, tag, and label in DMs (not just the id)", () => {
    const dm = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      isGroupChat: false,
      entityId: "dm-1",
      currentUserId: "312973896",
      currentUserTag: "user:alice:312973896",
      currentUserLabel: "Alice (@alice)",
    });
    expect(dm).toContain("current speaker id: 312973896");
    expect(dm).toContain("[user:alice:312973896]");
    expect(dm).toContain("Alice (@alice)");
  });

  it("notes owner status and a replied-to task in the session block", () => {
    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      entityId: "dm-1",
      currentUserId: "42",
      currentUserIsOwner: true,
      repliedTask: { id: 7, instruction: "ask how they are doing" },
    });
    expect(prompt).toContain("OWNER");
    expect(prompt).toContain("tasks_update");
    expect(prompt).toContain("#7");
  });

  it("includes the owner section and mood when provided", () => {
    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      ownerUsername: "georg",
      ownerUserId: "42",
      mood: { happiness: 5, energy: 5, sociability: 5, sarcasm: 5 } as never,
    });
    expect(prompt).toContain("Bot owner");
    expect(prompt).toContain("@georg");
    expect(prompt).toContain("Current mood");
  });

  it("lists known chat participants with their stored facts so names/nicknames resolve", () => {
    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      isGroupChat: true,
      entityId: "chat-1",
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
    expect(prompt).not.toContain("Respond with JSON only");
    expect(prompt.trimEnd().endsWith("you do not have to use tags at all.")).toBe(true);
  });

  it("does not carry MCP tool descriptions — those live only in the tool-round pass", () => {
    const prompt = buildSystemPrompt({ settings: makeSettings(), customPrompt: "" });
    expect(prompt).not.toContain("## MCP tools");
    expect(prompt).not.toContain(FETCH_LINK_TOOL_NAME);
  });
});

describe("buildToolRoundSystemPrompt", () => {
  it("is a standalone tool-selection prompt without personality or reply format", () => {
    const prompt = buildToolRoundSystemPrompt([
      FETCH_LINK_TOOL_NAME,
      SEARCH_WEB_TOOL_NAME,
    ]);
    expect(prompt).toContain("MCP tool-selection pass");
    expect(prompt).toContain(FETCH_LINK_TOOL_NAME);
    expect(prompt).toContain(SEARCH_WEB_TOOL_NAME);
    expect(prompt).toContain("tool_calls");
    expect(prompt).not.toContain("Respond with JSON only");
    expect(prompt).not.toContain(BASE_SYSTEM_PROMPT_CORE);
  });

  it("nudges memory_save (explicit requests + proactive) only when that tool is enabled", () => {
    const withMemory = buildToolRoundSystemPrompt(["memory_save"]);
    expect(withMemory).toMatch(/explicitly asks you to remember/i);
    expect(withMemory).toMatch(/introduc|name/i);

    const withoutMemory = buildToolRoundSystemPrompt([FETCH_LINK_TOOL_NAME]);
    expect(withoutMemory).not.toMatch(/explicitly asks you to remember/i);
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
