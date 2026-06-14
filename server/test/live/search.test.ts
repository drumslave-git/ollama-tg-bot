import { describe, expect, it } from "vitest";
import {
  buildSearchAnalyzerMessages,
  parseSearchDecision,
  type SearchDecision,
} from "../../src/bot/search-analyze-prompt.js";
import { liveClient, liveConfig, runAuxiliary } from "./helpers.js";

const cfg = liveConfig();

async function decide(userMessage: string): Promise<SearchDecision> {
  const client = liveClient(cfg!);
  const messages = buildSearchAnalyzerMessages({ userMessage });
  const { content } = await runAuxiliary(client, cfg!.model, messages, {
    numPredict: 192,
  });
  return parseSearchDecision(content);
}

describe.skipIf(!cfg)("live: web-search decision analyzer", () => {
  it("requests a search with a query for clearly current information", async () => {
    const decision = await decide(
      "what's the latest news about the Mars rover mission today?",
    );
    expect(decision.needsSearch).toBe(true);
    expect(decision.query, "a non-empty query is required when yes").toBeTruthy();
    expect((decision.query ?? "").length).toBeGreaterThan(2);
  });

  it("does not search for casual chat / opinions", async () => {
    const decision = await decide("ugh, mondays are the worst, right?");
    expect(decision.needsSearch).toBe(false);
    expect(decision.query).toBeNull();
  });

  it("does not search for general concept explanations", async () => {
    const decision = await decide(
      "can you explain how a binary search algorithm works?",
    );
    expect(decision.needsSearch).toBe(false);
  });

  it("keeps the query reasonably concise when it does search", async () => {
    const decision = await decide(
      "what is the current price of bitcoin right now?",
    );
    expect(decision.needsSearch).toBe(true);
    const words = (decision.query ?? "").trim().split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(10);
  });
});
