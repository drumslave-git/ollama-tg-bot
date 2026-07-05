import { describe, expect, it } from "vitest";
import {
  isLikelyMediaUrl,
  isMediaContentType,
} from "../../../src/features/web-browse/media.js";

describe("isLikelyMediaUrl", () => {
  it("matches direct media file URLs", () => {
    for (const url of [
      "https://cdn.example.com/video/clip.mp4",
      "https://example.com/stream/index.m3u8",
      "https://example.com/a/b.webm?token=1",
      "https://example.com/audio.mp3",
      // Tube-site style: extension followed by a trailing slash + token query.
      "https://x.example/get_file/1/abc/5000/5943/5943.mp4/?v-acctoken=ZZZ",
    ]) {
      expect(isLikelyMediaUrl(url), url).toBe(true);
    }
  });

  it("ignores non-media URLs", () => {
    for (const url of [
      "https://example.com/video/5943/",
      "https://777.ua/?register",
      "https://example.com/page.html",
      // Thumbnail whose name only contains ".mp4" as a substring — not a video.
      "https://example.com/screenshots/5943/preview.mp4.jpg",
    ]) {
      expect(isLikelyMediaUrl(url), url).toBe(false);
    }
  });
});

describe("isMediaContentType", () => {
  it("detects media content types", () => {
    expect(isMediaContentType("video/mp4")).toBe(true);
    expect(isMediaContentType("audio/mpeg")).toBe(true);
    expect(isMediaContentType("application/vnd.apple.mpegurl")).toBe(true);
  });

  it("rejects non-media content types", () => {
    expect(isMediaContentType("text/html; charset=utf-8")).toBe(false);
    expect(isMediaContentType(null)).toBe(false);
  });
});
