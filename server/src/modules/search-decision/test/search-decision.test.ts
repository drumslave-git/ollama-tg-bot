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
        '{"needs_search":true,"query":"bitcoin price today"}',
      ),
    ).toEqual({
      needsSearch: true,
      query: "bitcoin price today",
      reason: "LLM decision: yes",
    });
  });

  it("parses a no decision", () => {
    expect(parseSearchDecision('{"needs_search":false,"query":null}')).toEqual({
      needsSearch: false,
      query: null,
      reason: "LLM decision: no",
    });
  });

  it("treats yes without a usable query as no", () => {
    expect(parseSearchDecision('{"needs_search":true,"query":null}')).toEqual({
      needsSearch: false,
      query: null,
      reason: "LLM said yes but query was missing",
    });
  });

  it("rejects bare no outside JSON", () => {
    expect(parseSearchDecision("no")).toEqual({
      needsSearch: false,
      query: null,
      reason: "Could not parse LLM search decision",
    });
  });

  it("rejects bare yes without JSON", () => {
    expect(parseSearchDecision("yes")).toEqual({
      needsSearch: false,
      query: null,
      reason: "Could not parse LLM search decision",
    });
  });
});

describe("SEARCH_ANALYZER_SYSTEM", () => {
  it("requires JSON with needs_search and query", () => {
    expect(SEARCH_ANALYZER_SYSTEM).toContain("needs_search (boolean)");
    expect(SEARCH_ANALYZER_SYSTEM).toContain("query (string or null)");
    expect(SEARCH_ANALYZER_SYSTEM).toContain("Respond with JSON only");
  });
});

describe("buildSearchAnalyzerMessages", () => {
  it("includes the user message and format reminder", () => {
    const messages = buildSearchAnalyzerMessages({
      message: "what's the weather today?",
    });
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("what's the weather today?");
    expect(messages[1].content).toContain("needs_search");
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
