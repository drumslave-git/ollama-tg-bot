import { describe, expect, it } from "vitest";
import { summarizeMessageContent } from "../../src/bot/replies/replies.js";

describe("summarizeMessageContent", () => {
  it("labels animations and videos instead of a bare [file]", () => {
    expect(summarizeMessageContent({ animation: { file_id: "a" } } as never)).toBe(
      "[animation]",
    );
    expect(summarizeMessageContent({ video: { file_id: "v" } } as never)).toBe(
      "[video]",
    );
  });

  it("recognizes a GIF/clip sent as a document", () => {
    expect(
      summarizeMessageContent({
        document: { file_id: "d", mime_type: "video/mp4" },
      } as never),
    ).toBe("[video]");
    expect(
      summarizeMessageContent({
        document: { file_id: "d", mime_type: "image/gif" },
      } as never),
    ).toBe("[animation]");
  });

  it("still labels plain documents as files", () => {
    expect(
      summarizeMessageContent({
        document: { file_id: "d", mime_type: "application/pdf", file_name: "report.pdf" },
      } as never),
    ).toBe("[file: report.pdf]");
    expect(
      summarizeMessageContent({ document: { file_id: "d" } } as never),
    ).toBe("[file]");
  });

  it("prefers text/caption when present", () => {
    expect(
      summarizeMessageContent({ caption: "look", animation: { file_id: "a" } } as never),
    ).toBe("look");
  });
});
