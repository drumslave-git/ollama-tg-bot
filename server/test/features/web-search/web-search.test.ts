import { describe, expect, it, vi } from "vitest";
import {
  extractWebSearchSources,
  formatWebSearchContext,
  formatWebSearchFailure,
  runWebSearch,
} from "../../../src/features/web-search/index.js";

describe("formatWebSearchContext", () => {
  it("includes summary and sources", () => {
    const context = formatWebSearchContext("bitcoin price", {
      answer: "Around 60k",
      results: [
        {
          title: "BTC",
          url: "https://example.com/btc",
          content: "snippet",
        },
      ],
    });
    expect(context).toContain('Web search for "bitcoin price"');
    expect(context).toContain("Around 60k");
    expect(context).toContain("https://example.com/btc");
  });
});

describe("extractWebSearchSources", () => {
  it("deduplicates by url", () => {
    const sources = extractWebSearchSources({
      results: [
        { title: "A", url: "https://a.test", content: "" },
        { title: "A dup", url: "https://a.test", content: "" },
        { title: "B", url: "https://b.test", content: "" },
      ],
    });
    expect(sources).toHaveLength(2);
  });
});

describe("formatWebSearchFailure", () => {
  it("includes the error detail", () => {
    expect(formatWebSearchFailure("q", new Error("timeout"))).toContain(
      "timeout",
    );
  });
});

describe("runWebSearch", () => {
  it("returns failure output when the API errors", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 500 }));
    const result = await runWebSearch(
      { query: "weather" },
      { apiKey: "test-key", fetch },
    );
    expect(result.ok).toBe(false);
    expect(result.context).toContain("failed");
    expect(result.sources).toEqual([]);
  });

  it("returns formatted context on success", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        answer: "Sunny",
        results: [
          {
            title: "Forecast",
            url: "https://weather.test",
            content: "Clear skies",
          },
        ],
      }),
    );
    const result = await runWebSearch(
      { query: "weather today" },
      { apiKey: "test-key", fetch },
    );
    expect(result.ok).toBe(true);
    expect(result.answer).toBe("Sunny");
    expect(result.sources).toEqual([
      { title: "Forecast", url: "https://weather.test" },
    ]);
    expect(result.context).toContain("Sunny");
  });

  it("rejects empty queries without calling fetch", async () => {
    const fetch = vi.fn();
    const result = await runWebSearch({ query: "  " }, { apiKey: "k", fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Empty query");
  });
});
