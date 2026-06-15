import { describe, expect, it } from "vitest";
import {
  SEARCH_ANALYZER_SYSTEM,
  buildSearchAnalyzerMessages,
  parseSearchDecision,
} from "../src/prompt.js";

describe("parseSearchDecision", () => {
  it("parses a yes decision with a query", () => {
    expect(
      parseSearchDecision(
        "[SEARCH]\nyes\n[/SEARCH]\n[QUERY]\nbitcoin price today\n[/QUERY]",
      ),
    ).toEqual({
      needsSearch: true,
      query: "bitcoin price today",
      reason: "LLM decision: yes",
    });
  });

  it("parses a no decision", () => {
    expect(parseSearchDecision("[SEARCH]\nno\n[/SEARCH]")).toEqual({
      needsSearch: false,
      query: null,
      reason: "LLM decision: no",
    });
  });

  it("treats yes without a usable query as no", () => {
    expect(parseSearchDecision("[SEARCH]\nyes\n[/SEARCH]")).toEqual({
      needsSearch: false,
      query: null,
      reason: "LLM said yes but no [QUERY] block",
    });
  });

  it("rejects bare no outside the block", () => {
    expect(parseSearchDecision("no")).toEqual({
      needsSearch: false,
      query: null,
      reason: "Could not parse LLM search decision",
    });
  });

  it("rejects bare yes without blocks", () => {
    expect(parseSearchDecision("yes")).toEqual({
      needsSearch: false,
      query: null,
      reason: "Could not parse LLM search decision",
    });
  });

  it("rejects yes with [QUERY] but no [/SEARCH] closing tag", () => {
    expect(
      parseSearchDecision(
        "[SEARCH]\nyes\n[QUERY]\nThe Finals game\n[/QUERY]",
      ),
    ).toEqual({
      needsSearch: false,
      query: null,
      reason: "Could not parse LLM search decision",
    });
  });

  it("uses the last SEARCH block when the format is quoted in reasoning", () => {
    const raw =
      "Example: [SEARCH]\nyes\n[/SEARCH] then query.\nDecision: [SEARCH]\nno\n[/SEARCH]";
    expect(parseSearchDecision(raw)).toEqual({
      needsSearch: false,
      query: null,
      reason: "LLM decision: no",
    });
  });
});

describe("SEARCH_ANALYZER_SYSTEM", () => {
  it("forbids alternate tags and bare yes/no", () => {
    expect(SEARCH_ANALYZER_SYSTEM).toContain('Do not output bare "yes" or "no"');
    expect(SEARCH_ANALYZER_SYSTEM).toContain("[SEARCH]");
    expect(SEARCH_ANALYZER_SYSTEM).toContain("[QUERY]");
    expect(SEARCH_ANALYZER_SYSTEM).toContain("Close [SEARCH] with [/SEARCH] before you open [QUERY]");
    expect(SEARCH_ANALYZER_SYSTEM).toContain("Invalid (never output this");
  });
});

describe("buildSearchAnalyzerMessages", () => {
  it("includes the user message and format reminder", () => {
    const messages = buildSearchAnalyzerMessages({
      message: "what's the weather today?",
    });
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("what's the weather today?");
    expect(messages[1].content).toContain("[SEARCH]");
  });

  it("appends quoted reply context when present", () => {
    const messages = buildSearchAnalyzerMessages({
      message: "and now?",
      replyContext: "earlier we discussed stock prices",
    });
    expect(messages[1].content).toContain("Quoted reply context:");
    expect(messages[1].content).toContain("stock prices");
  });

  it("uses reply-thread context as the user payload", () => {
    const messages = buildSearchAnalyzerMessages({
      message: "ignored",
      replyContext: "[REPLY THREAD]\ncontext only",
    });
    expect(messages[1].content).toContain("[REPLY THREAD]");
    expect(messages[1].content).not.toContain("User message:");
  });
});

describe("decideSearch", () => {
  it("returns false for empty input without calling the LLM", async () => {
    const { decideSearch } = await import("../src/detect.js");
    const result = await decideSearch(
      { message: "   " },
      {
        baseUrl: "http://localhost:11434",
        model: "test",
      },
    );
    expect(result).toEqual({
      needsSearch: false,
      query: null,
      reason: "Empty message",
    });
  });
});
