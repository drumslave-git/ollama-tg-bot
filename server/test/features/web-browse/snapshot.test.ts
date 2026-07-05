import { describe, expect, it } from "vitest";
import {
  buildSnapshotScript,
  formatSnapshot,
  REF_ATTR,
  type PageSnapshot,
} from "../../../src/features/web-browse/snapshot.js";

describe("formatSnapshot", () => {
  const snapshot: PageSnapshot = {
    url: "https://example.com/search",
    title: "Search",
    text: "Results for widgets",
    elements: [
      { ref: 1, role: "link", name: "Home", href: "https://example.com/home" },
      { ref: 2, role: "text", name: "Search query", href: "" },
    ],
  };

  it("includes url, title, text, and numbered element refs with destinations", () => {
    const out = formatSnapshot(snapshot);
    expect(out).toContain("URL: https://example.com/search");
    expect(out).toContain("Title: Search");
    expect(out).toContain("Results for widgets");
    expect(out).toContain('[1] link "Home" -> https://example.com/home');
    expect(out).toContain('[2] text "Search query"');
  });

  it("notes when there are no interactive elements", () => {
    const out = formatSnapshot({ ...snapshot, elements: [] });
    expect(out).toContain("(none detected)");
  });

  it("captures link hrefs in the in-page snapshot script", () => {
    const script = buildSnapshotScript(REF_ATTR, 10);
    expect(script).toContain("href");
    expect(script).toContain('el.tagName === "A"');
  });
});

describe("buildSnapshotScript", () => {
  // The in-page code must be a plain string (not a transpiled function) so
  // esbuild/tsx `keepNames` never injects `__name(...)` wrappers that throw
  // `ReferenceError: __name is not defined` inside the browser.
  it("returns a self-contained string with the ref attr and limit inlined", () => {
    const script = buildSnapshotScript(REF_ATTR, 42);
    expect(typeof script).toBe("string");
    expect(script).toContain(REF_ATTR);
    expect(script).toContain("42");
    expect(script).not.toContain("__name");
    expect(script.trim().startsWith("(() =>")).toBe(true);
  });
});
