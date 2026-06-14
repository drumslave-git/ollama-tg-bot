import { describe, expect, it } from "vitest";
import {
  buildSearchAnalyzerMessages,
  parseSearchDecision,
} from "../../src/bot/search-analyze-prompt.js";

describe("parseSearchDecision", () => {
  it("parses a yes decision with a query", () => {
    const decision = parseSearchDecision(
      "[SEARCH]\nyes\n[/SEARCH]\n[QUERY]\nbitcoin price today\n[/QUERY]",
    );
    expect(decision.needsSearch).toBe(true);
    expect(decision.query).toBe("bitcoin price today");
  });

  it("parses a no decision", () => {
    const decision = parseSearchDecision("[SEARCH]\nno\n[/SEARCH]");
    expect(decision.needsSearch).toBe(false);
    expect(decision.query).toBeNull();
  });

  it("treats yes without a usable query as no", () => {
    const decision = parseSearchDecision("[SEARCH]\nyes\n[/SEARCH]");
    expect(decision.needsSearch).toBe(false);
    expect(decision.query).toBeNull();
  });

  it("falls back to query on the line after an unclosed yes", () => {
    const decision = parseSearchDecision("[SEARCH] yes\nmars rover news");
    expect(decision.needsSearch).toBe(true);
    expect(decision.query).toBe("mars rover news");
  });
});

describe("buildSearchAnalyzerMessages", () => {
  it("includes the user message", () => {
    const messages = buildSearchAnalyzerMessages({
      userMessage: "what's the weather today?",
    });
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("what's the weather today?");
  });

  it("appends quoted reply context when present", () => {
    const messages = buildSearchAnalyzerMessages({
      userMessage: "and now?",
      replyContext: "earlier we discussed stock prices",
    });
    expect(messages[1].content).toContain("Quoted reply context:");
    expect(messages[1].content).toContain("stock prices");
  });
});
