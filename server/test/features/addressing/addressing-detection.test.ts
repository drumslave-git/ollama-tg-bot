import { describe, expect, it } from "vitest";
import {
  ANALYZER_SYSTEM,
  buildAddressAnalyzerMessages,
  formatBotIdentity,
  parseAddressDecision,
} from "../../../src/features/addressing/prompt.js";

describe("parseAddressDecision", () => {
  it("treats a present name_match as addressed", () => {
    expect(parseAddressDecision('{"name_match":"inflected"}')).toEqual({
      result: true,
      reason: "LLM decision: yes — name appears as inflected",
    });
    expect(parseAddressDecision('{"name_match":"exact"}').result).toBe(true);
    expect(parseAddressDecision('{"name_match":"other_alphabet"}').result).toBe(
      true,
    );
  });

  it("treats absent as not addressed", () => {
    expect(parseAddressDecision('{"name_match":"absent"}')).toEqual({
      result: false,
      reason: "LLM decision: no — name absent",
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

  it("rejects an unknown or missing name_match value", () => {
    expect(parseAddressDecision('{"name_match":"maybe"}')).toEqual({
      result: false,
      reason: "Could not parse LLM address decision",
    });
    expect(parseAddressDecision('{"other":true}')).toEqual({
      result: false,
      reason: "Could not parse LLM address decision",
    });
  });
});

describe("ANALYZER_SYSTEM", () => {
  it("requires JSON with the name_match field", () => {
    expect(ANALYZER_SYSTEM).toContain("name_match (string)");
    expect(ANALYZER_SYSTEM).toContain("Respond with JSON only");
  });

  it("scopes the LLM pass to the display name", () => {
    expect(ANALYZER_SYSTEM).toContain("display name");
    expect(ANALYZER_SYSTEM).toContain("@username mentions");
  });
});

describe("formatBotIdentity", () => {
  it("formats username and display name", () => {
    expect(formatBotIdentity("alex_helper_bot", "Alex")).toBe(
      "Username: @alex_helper_bot; display name: Alex",
    );
  });
});

describe("buildAddressAnalyzerMessages", () => {
  it("embeds identity, chat type, sender and message", () => {
    const messages = buildAddressAnalyzerMessages({
      botIdentity: formatBotIdentity("alex_helper_bot", "Alex"),
      chatType: "supergroup",
      sender: "Georg",
      text: "Alex, hi",
    });
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("@alex_helper_bot");
    expect(messages[1].content).toContain("display name: Alex");
    expect(messages[1].content).toContain("supergroup");
    expect(messages[1].content).toContain("Georg");
    expect(messages[1].content).toContain("Alex, hi");
  });

  it("reminds the model to return JSON", () => {
    const messages = buildAddressAnalyzerMessages({
      botIdentity: formatBotIdentity("alex_helper_bot", "Alex"),
      chatType: "group",
      sender: "X",
      text: "hi",
    });
    expect(messages[1].content).toContain("Return JSON with the name_match field");
  });

  it("notes when automated name scan found no display name", () => {
    const messages = buildAddressAnalyzerMessages({
      botIdentity: formatBotIdentity("alex_helper_bot", "Alex"),
      chatType: "supergroup",
      sender: "testuser",
      text: "Today I got a request that you need to be available",
      nameScanFound: false,
    });
    expect(messages[1].content).toContain("Automated name scan");
    expect(messages[1].content).toContain("Second-person pronouns alone are not enough");
  });

  it("substitutes a placeholder for empty text", () => {
    const messages = buildAddressAnalyzerMessages({
      botIdentity: formatBotIdentity("alex_helper_bot", "Alex"),
      chatType: "group",
      sender: "X",
      text: "   ",
    });
    expect(messages[1].content).toContain("(empty or non-text)");
  });
});

describe("detectAddressing", () => {
  it("returns false for empty input without calling the LLM", async () => {
    const { detectAddressing } = await import("../../../src/features/addressing/detect.js");
    const result = await detectAddressing(
      { message: "   " },
      {
        baseUrl: "http://localhost:11434",
        model: "test",
        botUsername: "alex_helper_bot",
        botDisplayName: "Alex",
      },
    );
    expect(result).toEqual({ result: false, reason: "Empty message" });
  });
});
