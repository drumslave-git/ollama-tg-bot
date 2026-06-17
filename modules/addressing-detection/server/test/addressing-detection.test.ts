import { describe, expect, it } from "vitest";
import {
  ANALYZER_SYSTEM,
  buildAddressAnalyzerMessages,
  formatBotLabels,
  parseAddressDecision,
} from "../src/prompt.js";

describe("parseAddressDecision", () => {
  it("parses addressed=true", () => {
    expect(parseAddressDecision('{"addressed":true}')).toEqual({
      result: true,
      reason: "LLM decision: yes",
    });
  });

  it("parses addressed=false", () => {
    expect(parseAddressDecision('{"addressed":false}')).toEqual({
      result: false,
      reason: "LLM decision: no",
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

  it("rejects missing addressed field", () => {
    expect(parseAddressDecision('{"other":true}')).toEqual({
      result: false,
      reason: "Could not parse LLM address decision",
    });
  });
});

describe("ANALYZER_SYSTEM", () => {
  it("requires JSON with addressed boolean", () => {
    expect(ANALYZER_SYSTEM).toContain("addressed (boolean)");
    expect(ANALYZER_SYSTEM).toContain("Respond with JSON only");
  });
});

describe("formatBotLabels", () => {
  it("prefixes the username with @ and keeps aliases", () => {
    expect(formatBotLabels(["arguella_bot", "Arguella", "ArguellaBot"])).toBe(
      "@arguella_bot, Arguella, ArguellaBot",
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

  it("reminds the model to return JSON", () => {
    const messages = buildAddressAnalyzerMessages({
      botLabels: "@bot",
      chatType: "group",
      sender: "X",
      text: "hi",
    });
    expect(messages[1].content).toContain("Return JSON with addressed");
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
