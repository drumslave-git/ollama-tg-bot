import { describe, expect, it } from "vitest";
import {
  ANALYZER_SYSTEM,
  buildAddressAnalyzerMessages,
  formatBotLabels,
  parseAddressDecision,
} from "../src/prompt.js";

describe("parseAddressDecision", () => {
  it("parses a closed yes block", () => {
    expect(parseAddressDecision("[ADDRESS]\nyes\n[/ADDRESS]")).toEqual({
      result: true,
      reason: "LLM decision: yes",
    });
  });

  it("parses a closed no block", () => {
    expect(parseAddressDecision("[ADDRESS]\nno\n[/ADDRESS]")).toEqual({
      result: false,
      reason: "LLM decision: no",
    });
  });

  it("uses the last closed block when reasoning echoes the format", () => {
    const raw =
      "Format is [ADDRESS]\nyes\n[/ADDRESS] or no.\nDecision: [ADDRESS]\nno\n[/ADDRESS]";
    expect(parseAddressDecision(raw)).toEqual({
      result: false,
      reason: "LLM decision: no",
    });
  });

  it("accepts an unclosed trailing yes", () => {
    expect(parseAddressDecision("thinking...\n[ADDRESS] yes")).toEqual({
      result: true,
      reason: "LLM decision: yes",
    });
  });

  it("rejects malformed [yes] output", () => {
    expect(parseAddressDecision("[yes]")).toEqual({
      result: false,
      reason: "Could not parse LLM address decision",
    });
  });

  it("defaults to false on garbage", () => {
    expect(parseAddressDecision("maybe?")).toEqual({
      result: false,
      reason: "Could not parse LLM address decision",
    });
    expect(parseAddressDecision("")).toEqual({
      result: false,
      reason: "Could not parse LLM address decision",
    });
  });
});

describe("ANALYZER_SYSTEM", () => {
  it("forbids alternate tags like [yes]", () => {
    expect(ANALYZER_SYSTEM).toContain("Do not output [yes], [no]");
    expect(ANALYZER_SYSTEM).toContain("[ADDRESS]");
    expect(ANALYZER_SYSTEM).toContain("[/ADDRESS]");
  });
});

describe("formatBotLabels", () => {
  it("prefixes the username with @ and keeps aliases", () => {
    expect(formatBotLabels(["arguella_bot", "Arguella", "Аргуэлла"])).toBe(
      "@arguella_bot, Arguella, Аргуэлла",
    );
  });
});

describe("buildAddressAnalyzerMessages", () => {
  it("embeds identity, chat type, sender and message", () => {
    const messages = buildAddressAnalyzerMessages({
      botLabels: "@bot, Arguella",
      chatType: "supergroup",
      sender: "Georg",
      text: "Arguella, hi",
    });
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("@bot, Arguella");
    expect(messages[1].content).toContain("supergroup");
    expect(messages[1].content).toContain("Georg");
    expect(messages[1].content).toContain("Arguella, hi");
  });

  it("reminds the model to reply with only the ADDRESS block", () => {
    const messages = buildAddressAnalyzerMessages({
      botLabels: "@bot",
      chatType: "group",
      sender: "X",
      text: "hi",
    });
    expect(messages[1].content).toContain(
      "Reply with only one [ADDRESS]…[/ADDRESS] block",
    );
  });

  it("substitutes a placeholder for empty text", () => {
    const messages = buildAddressAnalyzerMessages({
      botLabels: "@bot",
      chatType: "group",
      sender: "X",
      text: "   ",
    });
    expect(messages[1].content).toContain("(empty or non-text)");
  });
});

describe("detectAddressing", () => {
  it("returns false for empty input without calling the LLM", async () => {
    const { detectAddressing } = await import("../src/detect.js");
    const result = await detectAddressing(
      { message: "   " },
      {
        baseUrl: "http://localhost:11434",
        model: "test",
        botAliases: ["bot"],
      },
    );
    expect(result).toEqual({ result: false, reason: "Empty message" });
  });
});
