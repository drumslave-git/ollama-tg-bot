import { describe, expect, it } from "vitest";
import {
  buildHistoryCompressionTranscript,
  extractParticipantUserIds,
  formatStoredMessageLine,
  parseUserRole,
  stripAssistantHistoryEnvelope,
  stripEchoedHistoryMarkup,
  userRoleTagFromParts,
} from "../../../src/features/history/format.js";
import { ASSISTANT_ROLE, COMPRESSED_ROLE } from "../../../src/features/history/types.js";

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

describe("formatStoredMessageLine", () => {
  it("prefixes user rows with bracket tags from the stored role", () => {
    expect(
      formatStoredMessageLine({
        role: "user:alice:424242",
        content: "hello",
      }),
    ).toBe("[user:alice:424242]: hello");
  });

  it("keeps assistant envelope when already present", () => {
    expect(
      formatStoredMessageLine({
        role: ASSISTANT_ROLE,
        content: "[assistant said]: hi",
      }),
    ).toBe("[assistant said]: hi");
  });

  it("passes compressed rows through unchanged", () => {
    expect(
      formatStoredMessageLine({
        role: COMPRESSED_ROLE,
        content: "Earlier summary.",
      }),
    ).toBe("Earlier summary.");
  });
});

describe("buildHistoryCompressionTranscript", () => {
  it("joins tagged lines for every stored row", () => {
    expect(
      buildHistoryCompressionTranscript([
        { role: "user:alice:424242", content: "hey" },
        { role: ASSISTANT_ROLE, content: "[assistant said]: hello" },
      ]),
    ).toBe(
      "[user:alice:424242]: hey\n[assistant said]: hello",
    );
  });

  it("omits pending base64 media rows", () => {
    expect(
      buildHistoryCompressionTranscript([
        { role: "user:alice:424242", content: "hey" },
        {
          role: "user:alice:424242",
          content:
            "[sent image]: data:image/jpeg;base64,QUJDREVGR0hJSktMTU5PQVBJRkdISUpMTU5P",
        },
      ]),
    ).toBe("[user:alice:424242]: hey");
  });
});
