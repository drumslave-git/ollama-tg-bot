import { describe, expect, it } from "vitest";
import { decideSearch } from "../../src/detect.js";

interface LiveConfig {
  baseURL: string;
  model: string;
  apiKey: string;
}

function liveConfig(): LiveConfig | null {
  const rawBase = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!rawBase || !model) return null;
  const baseURL = rawBase.endsWith("/v1") ? rawBase : `${rawBase}/v1`;
  return {
    baseURL,
    model,
    apiKey: (process.env.OPENAI_API_KEY ?? "").trim() || "not-needed",
  };
}

const cfg = liveConfig();

async function decide(userMessage: string) {
  return decideSearch(
    { message: userMessage },
    {
      baseUrl: cfg!.baseURL.replace(/\/v1$/, ""),
      model: cfg!.model,
      apiKey: cfg!.apiKey,
      numPredict: 192,
    },
  );
}

describe.skipIf(!cfg)("live: search-decision module", () => {
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
