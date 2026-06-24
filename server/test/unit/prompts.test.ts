import { describe, expect, it } from "vitest";
import {
  BASE_SYSTEM_PROMPT_CORE,
  buildBaseSystemPrompt,
  buildExplainSystemPrompt,
  buildSystemPrompt,
  buildToolRoundSystemPrompt,
} from "../../src/pipeline/adapters/system-prompt.js";
import { FETCH_LINK_TOOL_NAME } from "../../src/features/link-fetch/index.js";
import { SEARCH_WEB_TOOL_NAME } from "../../src/features/web-search/index.js";
import { HISTORY_GET_LATEST_TOOL_NAME } from "../../src/features/history/mcp-tools.js";
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

  it("exposes the group id in the session block for group chats", () => {
    const group = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      isGroupChat: true,
      entityId: "chat-1",
      groupChatId: "555",
    });
    expect(group).toContain("group id: 555");
    // Memory is tool-driven now — no injected group section.
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
    expect(prompt).not.toContain(HISTORY_GET_LATEST_TOOL_NAME);
    expect(prompt).toContain("trace body");
  });
});
