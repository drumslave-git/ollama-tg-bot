import { describe, expect, it } from "vitest";
import { liveConfig, liveReasoningMode, runLiveCompression } from "./helpers.js";

const cfg = liveConfig();

describe.skipIf(!cfg || !liveReasoningMode())(
  "live: history compression (reasoning)",
  () => {
    it("compresses with thinking enabled into a non-empty summary", async () => {
      const { result, summary } = await runLiveCompression(cfg!, true);
      expect(result.ok, result.reason ?? "compression failed").toBe(true);
      expect(result.messageCount).toBe(6);
      expect(result.resultChars, "summary should not be empty").toBeGreaterThan(
        80,
      );
      expect(summary.length).toBeGreaterThan(80);
    });

    it("preserves exact participant tags when thinking is on", async () => {
      const { result, summary } = await runLiveCompression(cfg!, true);
      expect(result.ok, result.reason ?? "compression failed").toBe(true);
      expect(summary).toMatch(/alice:424242/);
      expect(summary).not.toMatch(/\[user:user:\d+\]/);
      expect(summary.toLowerCase()).toMatch(/assistant said|\[assistant said\]/);
    });

    it("retains key topics when thinking is on", async () => {
      const { result, summary } = await runLiveCompression(cfg!, true);
      expect(result.ok, result.reason ?? "compression failed").toBe(true);
      const lower = summary.toLowerCase();
      expect(lower).toMatch(/frontend|developer|finals|500|error|image/);
    });
  },
);
