import { describe, expect, it } from "vitest";
import {
  formatDownloadReport,
  formatSize,
} from "../../src/features/web-browse/report.js";
import type { DownloadRecord } from "../../src/features/web-browse/tools.js";

const rec = (over: Partial<DownloadRecord> = {}): DownloadRecord => ({
  sourceUrl: "https://example.com/video/1/",
  filename: "Movie.mp4",
  sizeBytes: 5 * 1024 * 1024,
  inline: true,
  ...over,
});

describe("formatSize", () => {
  it("uses GB for a gigabyte or more", () => {
    expect(formatSize(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
    expect(formatSize(1_500_000_000)).toBe("1.40 GB");
  });

  it("uses MB between one megabyte and a gigabyte", () => {
    expect(formatSize(934 * 1024 * 1024)).toBe("934 MB");
  });

  it("uses KB below a megabyte", () => {
    expect(formatSize(200 * 1024)).toBe("200 KB");
  });
});

describe("formatDownloadReport", () => {
  it("returns empty for no downloads", () => {
    expect(formatDownloadReport([])).toBe("");
  });

  it("lists one file with source url, filename and size (singular header, no number)", () => {
    const out = formatDownloadReport([
      rec({ filename: "Love Story.mp4", sizeBytes: 940 * 1024 * 1024 }),
    ]);
    expect(out).toContain("Downloaded 1 file:");
    expect(out).toContain("<b>Love Story.mp4</b> — 940 MB");
    expect(out).toContain("https://example.com/video/1/");
    expect(out).not.toContain("1. ");
  });

  it("numbers multiple files and keeps each source url", () => {
    const out = formatDownloadReport([
      rec({ filename: "A.mp4", sourceUrl: "https://x/9074/" }),
      rec({ filename: "B.mp4", sourceUrl: "https://x/8796/" }),
    ]);
    expect(out).toContain("Downloaded 2 files:");
    expect(out).toContain("1. <b>A.mp4</b>");
    expect(out).toContain("https://x/9074/");
    expect(out).toContain("2. <b>B.mp4</b>");
    expect(out).toContain("https://x/8796/");
  });

  it("marks a large (non-inline) file as being in the downloads folder", () => {
    const out = formatDownloadReport([rec({ inline: false })]);
    expect(out).toContain("(in downloads folder)");
  });

  it("escapes HTML-special characters in the filename", () => {
    const out = formatDownloadReport([rec({ filename: "a<b>&c.mp4" })]);
    expect(out).toContain("a&lt;b&gt;&amp;c.mp4");
    expect(out).not.toContain("<b>&c");
  });
});
