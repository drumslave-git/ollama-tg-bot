import { describe, expect, it } from "vitest";
import {
  buildAddressAnalyzerMessages,
  parseAddressDecision,
} from "../../src/bot/address-analyze-prompt.js";

describe("parseAddressDecision", () => {
  it("parses a closed yes block", () => {
    expect(parseAddressDecision("[ADDRESS]\nyes\n[/ADDRESS]")).toBe(true);
  });

  it("parses a closed no block", () => {
    expect(parseAddressDecision("[ADDRESS]\nno\n[/ADDRESS]")).toBe(false);
  });

  it("uses the last closed block when reasoning echoes the format", () => {
    const raw =
      "Format is [ADDRESS]\nyes\n[/ADDRESS] or no.\nDecision: [ADDRESS]\nno\n[/ADDRESS]";
    expect(parseAddressDecision(raw)).toBe(false);
  });

  it("accepts an unclosed trailing yes", () => {
    expect(parseAddressDecision("thinking...\n[ADDRESS] yes")).toBe(true);
  });

  it("defaults to false on garbage", () => {
    expect(parseAddressDecision("maybe?")).toBe(false);
    expect(parseAddressDecision("")).toBe(false);
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
