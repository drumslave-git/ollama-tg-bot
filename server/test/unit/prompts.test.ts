import { describe, expect, it } from "vitest";
import {
  BASE_SYSTEM_PROMPT_CORE,
  buildBaseSystemPrompt,
  buildExplainSystemPrompt,
  buildSystemPrompt,
} from "../../src/prompts.js";
import { makeSettings } from "../helpers/settings.js";

describe("buildBaseSystemPrompt", () => {
  it("includes the core prompt, a length hint, and the reply format", () => {
    const prompt = buildBaseSystemPrompt(makeSettings({ numPredict: 512 }));
    expect(prompt).toContain(BASE_SYSTEM_PROMPT_CORE);
    expect(prompt).toContain("[REPLY]");
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
    expect(group).toContain("Known facts about this group");

    const dm = buildSystemPrompt({
      settings: makeSettings(),
      customPrompt: "",
      isGroupChat: false,
    });
    expect(dm).not.toContain("Known facts about this group");
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
    expect(prompt.trimEnd().endsWith("(e.g. <b></b>).")).toBe(true);
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
    expect(prompt).toContain("Pirate");
    expect(prompt).toContain("Not applicable (private chat).");
  });
});
