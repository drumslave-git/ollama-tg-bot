import { describe, expect, it, vi } from "vitest";
import {
  makeBrowserToolDispatcher,
  type AgentToolContext,
} from "../../../src/features/web-browse/tools.js";
import type { BrowserSession } from "../../../src/features/web-browse/session.js";

function makeCtx(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    session: {
      currentUrl: () => "https://example.com",
      screenshot: async () => Buffer.from("PNGDATA"),
    } as unknown as BrowserSession,
    isOwner: false,
    downloadMaxMb: 20,
    recorder: null,
    downloads: [],
    onAction: vi.fn(),
    onDownload: vi.fn(),
    ...overrides,
  };
}

describe("browser tool dispatcher", () => {
  it("refuses browser_download for a non-owner run", async () => {
    const ctx = makeCtx({ isOwner: false });
    const dispatch = makeBrowserToolDispatcher(ctx);
    const res = await dispatch("browser_download", { url: "https://example.com/f.pdf" });
    expect(res.text).toMatch(/owner/i);
    expect(ctx.onDownload).not.toHaveBeenCalled();
  });

  it("returns the screenshot as an image and records a step", async () => {
    const onAction = vi.fn();
    const ctx = makeCtx({ onAction });
    const dispatch = makeBrowserToolDispatcher(ctx);
    const res = await dispatch("browser_screenshot", {});
    expect(res.images?.[0]).toBe(Buffer.from("PNGDATA").toString("base64"));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("reports an unknown tool name", async () => {
    const dispatch = makeBrowserToolDispatcher(makeCtx());
    const res = await dispatch("nope", {});
    expect(res.text).toMatch(/unknown tool/i);
  });
});
