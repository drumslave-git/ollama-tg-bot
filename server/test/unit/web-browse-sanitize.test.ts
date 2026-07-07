import { describe, expect, it } from "vitest";
import { sanitizeAgentReport } from "../../src/features/web-browse/agent.js";

describe("sanitizeAgentReport", () => {
  it("strips leaked tool-call tokens down to nothing", () => {
    // The exact garbage a stalled model emitted into content when tools were
    // taken away for the forced final answer — this must never reach the chat.
    const leaked =
      '<|tool_call>call:browser_navigate{url:<|"|>https://example.com/videos/?by=duration<|"|>}<tool_call|>';
    expect(sanitizeAgentReport(leaked)).toBe("");
  });

  it("keeps real prose untouched", () => {
    const report = "I downloaded 3 videos and saved them to the folder.";
    expect(sanitizeAgentReport(report)).toBe(report);
  });

  it("preserves normal HTML tags (no pipe) while dropping token junk", () => {
    expect(sanitizeAgentReport("<b>Done</b> <|tool_call>")).toBe("<b>Done</b>");
  });

  it("removes a bare call:name{...} body left without surrounding tokens", () => {
    expect(sanitizeAgentReport('here: call:browser_download{url:x}')).toBe(
      "here:",
    );
  });
});
