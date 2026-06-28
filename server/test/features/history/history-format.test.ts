import { describe, expect, it } from "vitest";
import {
  combineHistoryContent,
  extractParticipantUserIds,
  formatStoredMessageLine,
  isBase64MediaHistoryContent,
  parseBase64MediaHistoryContent,
  parseUserRole,
  redactBase64MediaForDisplay,
  replaceBase64WithVisionDescription,
  stripAssistantHistoryEnvelope,
  stripEchoedHistoryMarkup,
  userRoleTagFromParts,
} from "../../../src/features/history/format.js";
import { ASSISTANT_ROLE } from "../../../src/features/history/types.js";

const IMG = "data:image/jpeg;base64,QUJDREVG";
const TEXT_PLUS_IMG = `look at this\n[sent image]: ${IMG}`;

describe("userRoleTagFromParts", () => {
  it("prefers username, lowercased and sanitized", () => {
    expect(userRoleTagFromParts("42", "GeOrG", "George")).toBe("user:georg:42");
  });

  it("falls back to first name then 'unknown'", () => {
    expect(userRoleTagFromParts("42", null, "Bob")).toBe("user:bob:42");
    expect(userRoleTagFromParts("42")).toBe("user:unknown:42");
  });

  it("replaces tag-breaking characters", () => {
    expect(userRoleTagFromParts("42", "a:b]c")).toBe("user:a_b_c:42");
  });
});

describe("parseUserRole", () => {
  it("parses a normal role tag", () => {
    expect(parseUserRole("user:georg:42")).toEqual({
      username: "georg",
      userId: "42",
    });
  });

  it("keeps colons inside the username segment", () => {
    expect(parseUserRole("user:a:b:42")).toEqual({ username: "a:b", userId: "42" });
  });

  it("returns null for non-user roles", () => {
    expect(parseUserRole("assistant")).toBeNull();
  });
});

describe("extractParticipantUserIds", () => {
  it("collects unique ids from roles plus extras", () => {
    const ids = extractParticipantUserIds(
      ["user:a:1", "user:b:2", "assistant"],
      ["3", "1"],
    );
    expect(ids.sort()).toEqual(["1", "2", "3"]);
  });
});

describe("stripAssistantHistoryEnvelope", () => {
  it("removes the assistant-said prefix and sticker lines", () => {
    const input = "[assistant said] hi\n[sticker: smile]";
    expect(stripAssistantHistoryEnvelope(input)).toBe("hi");
  });
});

describe("stripEchoedHistoryMarkup", () => {
  it("removes an echoed user history prefix", () => {
    expect(stripEchoedHistoryMarkup("[user:bob:42 said]: hello")).toBe("hello");
  });

  it("removes an echoed assistant prefix", () => {
    expect(stripEchoedHistoryMarkup("[assistant said]: hey")).toBe("hey");
  });
});

describe("combineHistoryContent", () => {
  it("joins text and media into one row", () => {
    expect(combineHistoryContent("hi", `[sent image]: ${IMG}`)).toBe(
      `hi\n[sent image]: ${IMG}`,
    );
  });

  it("keeps a single part and returns null when empty", () => {
    expect(combineHistoryContent("hi", null)).toBe("hi");
    expect(combineHistoryContent(null, `[sent image]: ${IMG}`)).toBe(
      `[sent image]: ${IMG}`,
    );
    expect(combineHistoryContent(null, null)).toBeNull();
    expect(combineHistoryContent("  ", "")).toBeNull();
  });
});

describe("pending base64 media in a combined row", () => {
  it("detects and parses the media line after the text line", () => {
    expect(isBase64MediaHistoryContent(TEXT_PLUS_IMG)).toBe(true);
    const parsed = parseBase64MediaHistoryContent(TEXT_PLUS_IMG);
    expect(parsed).toMatchObject({
      prefix: "[sent image]",
      mediaKind: "image",
      base64: "QUJDREVG",
      surroundingLines: ["look at this"],
      mediaLineIndex: 1,
    });
  });

  it("captions the media while keeping the user's text", () => {
    expect(
      replaceBase64WithVisionDescription(TEXT_PLUS_IMG, "a red car"),
    ).toBe("look at this\n[sent image]: a red car");
  });

  it("folds sticker emoji into the caption and drops the emoji line", () => {
    const content = `nice\n[sent sticker]: ${IMG}\n(sticker emoji: 😀)`;
    expect(parseBase64MediaHistoryContent(content)?.packEmoji).toBe("😀");
    expect(replaceBase64WithVisionDescription(content, "a cat")).toBe(
      "nice\n[sent sticker]: a cat. it represents emoji 😀",
    );
  });

  it("redacts media to a placeholder but keeps the text", () => {
    expect(redactBase64MediaForDisplay(TEXT_PLUS_IMG)).toBe(
      "look at this\n[sent image]: [image not yet described]",
    );
    expect(redactBase64MediaForDisplay("plain text")).toBeNull();
  });

  it("still handles a media-only (legacy) row", () => {
    const content = `[sent image]: ${IMG}`;
    expect(replaceBase64WithVisionDescription(content, "a dog")).toBe(
      "[sent image]: a dog",
    );
    expect(redactBase64MediaForDisplay(content)).toBe(
      "[sent image]: [image not yet described]",
    );
  });
});

describe("formatStoredMessageLine", () => {
  it("prefixes user rows with bracket tags from the stored role", () => {
    expect(
      formatStoredMessageLine({
        role: "user:alice:424242",
        content: "hello",
      }),
    ).toBe("[user:alice:424242]: hello");
  });

  it("adds the assistant envelope to clean stored content", () => {
    expect(
      formatStoredMessageLine({
        role: ASSISTANT_ROLE,
        content: "hi",
      }),
    ).toBe("[assistant said]: hi");
  });

  it("keeps assistant envelope when already present", () => {
    expect(
      formatStoredMessageLine({
        role: ASSISTANT_ROLE,
        content: "[assistant said]: hi",
      }),
    ).toBe("[assistant said]: hi");
  });
});
