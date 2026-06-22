import { describe, expect, it } from "vitest";
import {
  STICKER_RESPONSE_FORMAT,
  buildStickerAnalyzerMessages,
  formatStickerCatalogSection,
  parseStickerChoice,
  resolveStickerFileId,
  rollStickerReplyChance,
  pickSticker,
} from "../../../src/features/sticker/index.js";

const catalog = {
  packName: "TestPack",
  stickers: [
    { index: 0, emoji: "😈", fileId: "file-1" },
    { index: 1, emoji: "💀", fileId: "file-2" },
  ],
};

describe("rollStickerReplyChance", () => {
  it("never hits when chance is zero", () => {
    expect(rollStickerReplyChance(0).hit).toBe(false);
  });

  it("always hits when chance is 100", () => {
    expect(rollStickerReplyChance(100).hit).toBe(true);
  });
});

describe("formatStickerCatalogSection", () => {
  it("lists sticker numbers and emojis", () => {
    expect(formatStickerCatalogSection("TestPack", catalog.stickers)).toContain(
      "1: 😈",
    );
  });
});

describe("parseStickerChoice", () => {
  it("parses a JSON sticker choice", () => {
    expect(parseStickerChoice('{"choice":"13"}')).toEqual({
      choice: "13",
      reason: "LLM sticker selected",
    });
  });

  it("rejects invalid JSON", () => {
    expect(parseStickerChoice("not json")).toEqual({
      choice: null,
      reason: "Could not parse LLM sticker choice",
    });
  });

  it("treats none as skip", () => {
    expect(parseStickerChoice('{"choice":"none"}')).toEqual({
      choice: null,
      reason: "LLM decision: skip",
    });
  });
});

describe("resolveStickerFileId", () => {
  it("resolves by 1-based number", () => {
    expect(resolveStickerFileId("2", catalog.stickers)).toBe("file-2");
  });

  it("resolves by emoji", () => {
    expect(resolveStickerFileId("😈", catalog.stickers)).toBe("file-1");
  });
});

describe("buildStickerAnalyzerMessages", () => {
  it("includes catalog, reply, and format reminder", () => {
    const messages = buildStickerAnalyzerMessages({
      catalog,
      botReply: "Hello there",
      message: "hi",
    });
    expect(messages?.[0].content).toContain("TestPack");
    expect(messages?.[1].content).toContain("Hello there");
    expect(messages?.[1].content).toContain("Return JSON");
    expect(STICKER_RESPONSE_FORMAT.name).toBe("sticker_choice");
  });
});

describe("pickSticker", () => {
  it("returns without LLM when catalog is empty", async () => {
    const result = await pickSticker(
      {
        botReply: "Hi",
        catalog: { packName: "", stickers: [] },
      },
      {
        baseUrl: "http://localhost",
        model: "test",
        chatComplete: async () => '{"choice":"1"}',
      },
    );
    expect(result.choice).toBeNull();
    expect(result.reason).toBe("Sticker catalog not loaded");
  });

  it("resolves file id from mocked LLM output", async () => {
    const result = await pickSticker(
      {
        botReply: "Dramatic reply",
        catalog,
      },
      {
        baseUrl: "http://localhost",
        model: "test",
        chatComplete: async () => '{"choice":"2"}',
      },
    );
    expect(result.choice).toBe("2");
    expect(result.fileId).toBe("file-2");
  });
});
