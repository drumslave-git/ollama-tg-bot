import { describe, expect, it, vi } from "vitest";
import {
  extractUrls,
  fetchLink,
  formatLinkFetchContext,
  formatLinkFetchFailure,
  isSafePublicUrl,
  runLinkFetch,
} from "../../../src/features/link-fetch/index.js";

describe("isSafePublicUrl", () => {
  it("allows public https URLs", () => {
    expect(isSafePublicUrl("https://example.com/page")).toBe(true);
  });

  it("blocks localhost and private IPs", () => {
    expect(isSafePublicUrl("http://localhost/admin")).toBe(false);
    expect(isSafePublicUrl("http://127.0.0.1/")).toBe(false);
    expect(isSafePublicUrl("http://192.168.1.1/")).toBe(false);
    expect(isSafePublicUrl("http://10.0.0.5/")).toBe(false);
  });

  it("blocks credentials in the URL", () => {
    expect(isSafePublicUrl("https://user:pass@example.com")).toBe(false);
  });
});

describe("extractUrls", () => {
  it("extracts unique safe URLs and trims trailing punctuation", () => {
    expect(
      extractUrls("see https://example.com/a, and https://example.com/a."),
    ).toEqual(["https://example.com/a"]);
  });

  it("collects URLs from multiple text blobs", () => {
    expect(
      extractUrls("first https://a.test", null, "second https://b.test"),
    ).toEqual(["https://a.test/", "https://b.test/"]);
  });

  it("skips unsafe URLs", () => {
    expect(extractUrls("http://127.0.0.1/secret")).toEqual([]);
  });
});

describe("formatLinkFetchContext", () => {
  it("includes page title and content", () => {
    const context = formatLinkFetchContext([
      {
        url: "https://example.com",
        title: "Example",
        text: "Hello world",
      },
    ]);
    expect(context).toContain("https://example.com");
    expect(context).toContain("Example");
    expect(context).toContain("Hello world");
  });

  it("includes per-page errors", () => {
    const context = formatLinkFetchContext([
      {
        url: "https://example.com",
        title: "",
        text: "",
        error: "timeout",
      },
    ]);
    expect(context).toContain("Failed to load: timeout");
  });
});

describe("formatLinkFetchFailure", () => {
  it("includes URLs and error detail", () => {
    expect(
      formatLinkFetchFailure(
        ["https://example.com"],
        new Error("browser down"),
      ),
    ).toContain("browser down");
  });
});

describe("fetchLink", () => {
  it("blocks unsafe URLs without fetching", async () => {
    const fetchPages = vi.fn();
    const result = await fetchLink("http://127.0.0.1/secret", { fetchPages });
    expect(fetchPages).not.toHaveBeenCalled();
    expect(result.resolved).toBe(false);
    expect(result.context).toContain("Failed to load");
  });

  it("returns formatted context when page loads", async () => {
    const fetchPages = vi.fn(async () => [
      {
        url: "https://example.com",
        title: "Example",
        text: "Body",
      },
    ]);
    const result = await fetchLink("https://example.com", { fetchPages });
    expect(result.resolved).toBe(true);
    expect(result.context).toContain("Body");
  });
});

describe("runLinkFetch", () => {
  it("returns no links without calling fetch", async () => {
    const fetchPages = vi.fn();
    const result = await runLinkFetch(
      { message: "hello" },
      { fetchPages },
    );
    expect(fetchPages).not.toHaveBeenCalled();
    expect(result.urlCount).toBe(0);
    expect(result.reason).toBe("No links in message");
  });

  it("returns formatted context when pages load", async () => {
    const fetchPages = vi.fn(async () => [
      {
        url: "https://example.com",
        title: "Example",
        text: "Body",
      },
    ]);
    const result = await runLinkFetch(
      { message: "read https://example.com please" },
      { fetchPages },
    );
    expect(result.resolved).toBe(true);
    expect(result.context).toContain("Body");
    expect(result.reason).toBe("Pages fetched");
  });

  it("returns failure context when fetch throws", async () => {
    const fetchPages = vi.fn(async () => {
      throw new Error("launch failed");
    });
    const result = await runLinkFetch(
      { message: "https://example.com" },
      { fetchPages },
    );
    expect(result.resolved).toBe(false);
    expect(result.context).toContain("launch failed");
  });

  it("marks unresolved when every page errors", async () => {
    const fetchPages = vi.fn(async () => [
      {
        url: "https://example.com",
        title: "",
        text: "",
        error: "404",
      },
    ]);
    const result = await runLinkFetch(
      { message: "https://example.com" },
      { fetchPages },
    );
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe("All page fetches failed");
    expect(result.context).toContain("404");
  });
});
