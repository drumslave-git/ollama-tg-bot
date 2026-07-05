import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { embedMetadata } from "../../../src/features/web-browse/metadata.js";

describe("embedMetadata", () => {
  it("leaves the original file intact when tagging fails or ffmpeg is missing", async () => {
    // Non-media content: ffmpeg (if installed) rejects it; if not installed the
    // spawn errors. Either way the call must return false and not touch the file.
    const filePath = path.join(os.tmpdir(), `emt-${Date.now()}.mp4`);
    await fs.writeFile(filePath, "not real media data");
    try {
      const ok = await embedMetadata(filePath, {
        title: "Title",
        description: "Desc",
        sourcePage: "https://example.com/video/1",
        sourceUrl: "https://example.com/video/1.mp4",
        date: "2026-07-04",
      });
      expect(ok).toBe(false);
      expect(await fs.readFile(filePath, "utf8")).toBe("not real media data");
      // No leftover temp file.
      await expect(
        fs.access(filePath.replace(/\.mp4$/, ".tagged.mp4")),
      ).rejects.toThrow();
    } finally {
      await fs.rm(filePath, { force: true }).catch(() => {});
    }
  });
});
