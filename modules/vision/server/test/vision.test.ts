import { describe, expect, it } from "vitest";
import {
  isRasterImagePath,
  messageHasUserImage,
  messageHasVisionMedia,
  stickerHistoryLabel,
  stickerPackEmoji,
  stickerUnavailableText,
} from "../src/index.js";

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

  it("ignores non-image content", () => {
    expect(messageHasVisionMedia({ text: "hello" } as never)).toBe(false);
    expect(
      messageHasVisionMedia({
        document: { mime_type: "application/pdf", file_id: "d" },
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
