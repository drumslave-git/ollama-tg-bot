import { describe, expect, it } from "vitest";
import {
  extractParticipantUserIds,
  parseUserRole,
  stripAssistantHistoryEnvelope,
  stripEchoedHistoryMarkup,
  userRoleTagFromParts,
} from "../../src/bot/history-format.js";

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
