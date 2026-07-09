import { describe, expect, it } from "vitest";
import {
  resolveSummaryMessageMedia,
  sanitizeSummaryMessageContent,
} from "../../../src/features/summaries/summarize.js";

describe("sanitizeSummaryMessageContent", () => {
  it("redacts pending media rows before they enter the summary prompt", () => {
    const content = `look at this\n[sent image]: data:image/jpeg;base64,${"A".repeat(5000)}`;

    const sanitized = sanitizeSummaryMessageContent(content);

    expect(sanitized).toBe("look at this\n[sent image]: [image not yet described]");
    expect(sanitized).not.toContain("data:image");
    expect(sanitized).not.toContain("AAAA");
  });

  it("omits stray inline image data URIs", () => {
    const content = `before data:image/png;base64,${"B".repeat(5000)} after`;

    const sanitized = sanitizeSummaryMessageContent(content);

    expect(sanitized).toBe("before [image data omitted] after");
  });

  it("caps a single huge text message", () => {
    const sanitized = sanitizeSummaryMessageContent("x".repeat(2000), 128);

    expect(sanitized.length).toBeLessThanOrEqual(128);
    expect(sanitized).toContain("[message truncated for summary]");
  });
});

describe("resolveSummaryMessageMedia", () => {
  it("runs vision, updates the history row, and returns described content", async () => {
    const content = `look at this\n[sent image]: data:image/jpeg;base64,${"A".repeat(5000)}`;
    const updates: string[] = [];

    const result = await resolveSummaryMessageMedia(
      "chat-1",
      {
        role: "user:alice:424242",
        content,
        messageId: 100,
      },
      {
        model: "test-model",
        traceTurnId: 7,
        describeImages: async (input) => {
          expect(input.images).toEqual([
            { base64: "A".repeat(5000), mimeHint: "image/jpeg" },
          ]);
          expect(input.traceTurnId).toBe(7);
          return "a small red car";
        },
        updateHistoryBase64Media: async (chatId, isMatch, replace) => {
          expect(chatId).toBe("chat-1");
          expect(isMatch(content)).toBe(true);
          const next = replace(content);
          if (next) updates.push(next);
          return next ? 1 : 0;
        },
      },
    );

    expect(result.content).toBe("look at this\n[sent image]: a small red car");
    expect(updates).toEqual(["look at this\n[sent image]: a small red car"]);
  });
});
