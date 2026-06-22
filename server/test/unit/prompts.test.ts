import { describe, expect, it } from "vitest";
import {
  BASE_SYSTEM_PROMPT_CORE,
  buildBaseSystemPrompt,
  buildExplainSystemPrompt,
  buildMcpToolsPromptSection,
  buildSystemPrompt,
  buildToolRoundSystemPrompt,
} from "../../src/pipeline/adapters/system-prompt.js";
import { FETCH_LINK_TOOL_NAME } from "@llm-tg-bot/modules-link-fetch";
import { SEARCH_WEB_TOOL_NAME } from "@llm-tg-bot/modules-web-search";
import { makeSettings } from "../helpers/settings.js";

describe("buildBaseSystemPrompt", () => {
  it("includes the core prompt, a length hint, and the reply format", () => {
    const prompt = buildBaseSystemPrompt(makeSettings({ numPredict: 512 }));
    expect(prompt).toContain(BASE_SYSTEM_PROMPT_CORE);
    expect(prompt).toContain("reply (string)");
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

  it("adds the group section only for group chats", () => {
    const group = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      isGroupChat: true,
      groupMemoryFacts: ["likes chess"],
    });
    expect(group).toContain("This group's culture and how to behave here");

    const dm = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      isGroupChat: false,
    });
    expect(dm).not.toContain("This group's culture and how to behave here");
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
    expect(prompt).toContain("reply (string)");
    expect(prompt).toContain("Respond with JSON only");
    expect(prompt.trimEnd().endsWith("you do not have to use tags at all.")).toBe(true);
  });

  it("includes MCP tool guidance when tools are enabled", () => {
    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      enabledMcpToolNames: [FETCH_LINK_TOOL_NAME, SEARCH_WEB_TOOL_NAME],
    });
    expect(prompt).toContain("## MCP tools");
    expect(prompt).toContain(FETCH_LINK_TOOL_NAME);
    expect(prompt).toContain(SEARCH_WEB_TOOL_NAME);
    expect(prompt).toContain("LLM-only");
    expect(prompt.indexOf("## MCP tools")).toBeLessThan(prompt.indexOf("Respond with JSON only"));
  });

  it("omits MCP tool guidance when no tools are enabled", () => {
    expect(buildMcpToolsPromptSection([])).toBe("");
    const prompt = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      enabledMcpToolNames: [],
    });
    expect(prompt).not.toContain("## MCP tools");
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
  it("describes the active personality and stays out of character", () => {
    const prompt = buildExplainSystemPrompt({
      settings: makeSettings(),
      activePersonalityName: "Pirate",
      activePersonalityPrompt: "Talk like a pirate.",
      generalMemoryFacts: [],
      groupMemoryFacts: [],
      userMemoryFacts: [],
      isGroupChat: false,
    });
    expect(prompt).toContain("meta assistant");
    expect(prompt).toContain("Do NOT roleplay");
    expect(prompt).toContain("reference only");
    expect(prompt).toContain("Talk like a pirate.");
  });
});
