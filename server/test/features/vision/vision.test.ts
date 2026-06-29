import { describe, expect, it } from "vitest";
import {
  isRasterImagePath,
  messageHasUserImage,
  messageHasVisionMedia,
  stickerHistoryLabel,
  stickerPackEmoji,
  stickerUnavailableText,
} from "../../../src/features/vision/index.js";

describe("isRasterImagePath", () => {
  it("accepts common raster extensions", () => {
    expect(isRasterImagePath("photos/abc.jpg")).toBe(true);
    expect(isRasterImagePath("stickers/sticker.webp")).toBe(true);
    expect(isRasterImagePath("file.PNG")).toBe(true);
  });

  it("rejects non-raster paths", () => {
    expect(isRasterImagePath("animation.tgs")).toBe(false);
    expect(isRasterImagePath("clip.webm")).toBe(false);
  });
});

describe("messageHasVisionMedia", () => {
  it("detects photos, stickers, and image documents", () => {
    expect(messageHasVisionMedia({ photo: [{ file_id: "p" }] } as never)).toBe(
      true,
    );
    expect(messageHasVisionMedia({ sticker: { file_id: "s" } } as never)).toBe(
      true,
    );
    expect(
      messageHasVisionMedia({
        document: { mime_type: "image/png", file_id: "d" },
      } as never),
    ).toBe(true);
  });

  it("detects animations, videos, and gif/video documents via their frame", () => {
    // mp4 "GIF" — readable through its static thumbnail.
    expect(
      messageHasVisionMedia({
        animation: { file_id: "a", mime_type: "video/mp4", thumbnail: { file_id: "t" } },
      } as never),
    ).toBe(true);
    // true image/gif — decodable directly, no thumbnail needed.
    expect(
      messageHasVisionMedia({
        animation: { file_id: "a", mime_type: "image/gif" },
      } as never),
    ).toBe(true);
    expect(
      messageHasVisionMedia({
        video: { file_id: "v", mime_type: "video/mp4", thumbnail: { file_id: "t" } },
      } as never),
    ).toBe(true);
    // GIF/clip sent as a document.
    expect(
      messageHasVisionMedia({
        document: { mime_type: "video/mp4", file_id: "d", thumbnail: { file_id: "t" } },
      } as never),
    ).toBe(true);
  });

  it("ignores non-image content", () => {
    expect(messageHasVisionMedia({ text: "hello" } as never)).toBe(false);
    expect(
      messageHasVisionMedia({
        document: { mime_type: "application/pdf", file_id: "d" },
      } as never),
    ).toBe(false);
    // A document archive with a thumbnail is not vision media.
    expect(
      messageHasVisionMedia({
        document: { mime_type: "application/zip", file_id: "d", thumbnail: { file_id: "t" } },
      } as never),
    ).toBe(false);
    // An mp4 animation with no thumbnail can't be read.
    expect(
      messageHasVisionMedia({
        animation: { file_id: "a", mime_type: "video/mp4" },
      } as never),
    ).toBe(false);
  });
});

describe("messageHasUserImage", () => {
  it("includes photos and image files but not stickers", () => {
    expect(messageHasUserImage({ photo: [{ file_id: "p" }] } as never)).toBe(
      true,
    );
    expect(messageHasUserImage({ sticker: { file_id: "s" } } as never)).toBe(
      false,
    );
  });
});

describe("sticker helpers", () => {
  it("formats pack emoji and history labels", () => {
    const sticker = { emoji: "😀", file_id: "x" } as never;
    expect(stickerPackEmoji(sticker)).toBe("😀");
    expect(stickerHistoryLabel(sticker)).toContain("😀");
  });

  it("describes unavailable animated stickers without thumbnails", () => {
    const text = stickerUnavailableText({
      is_animated: true,
      emoji: "🎉",
    } as never);
    expect(text).toContain("no preview image");
    expect(text).toContain("🎉");
  });
});
