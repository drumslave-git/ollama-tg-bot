import { describe, expect, it } from "vitest";
import {
  formatHistoryPointer,
  historyBeforeMessageId,
  insertIndexAfterMessageId,
  parseHistoryPointer,
} from "../src/history-pointer.js";
import { ASSISTANT_ROLE } from "../src/types.js";

const user = (content: string, messageId: number) => ({
  role: "user:alice:424242",
  content,
  messageId,
});

const assistant = (content: string) => ({
  role: ASSISTANT_ROLE,
  content: `[assistant said]: ${content}`,
});

describe("formatHistoryPointer", () => {
  it("round-trips conv key and telegram message id", () => {
    const pointer = formatHistoryPointer("-100999001", 42);
    expect(pointer).toBe("-100999001:42");
    expect(parseHistoryPointer(pointer)).toEqual({
      convKey: "-100999001",
      messageId: 42,
    });
  });
});

describe("historyBeforeMessageId", () => {
  it("returns empty history for the first addressed message", () => {
    const stored = [
      user("hello", 1),
      user("how are you doing", 2),
      user("Im bored", 3),
    ];
    expect(historyBeforeMessageId(stored, 1)).toEqual([]);
  });

  it("includes prior exchange after reply is inserted after the pointer", () => {
    const stored = [
      user("hello", 1),
      assistant("hi there"),
      user("how are you doing", 2),
      user("Im bored", 3),
    ];
    expect(historyBeforeMessageId(stored, 2)).toEqual([
      user("hello", 1),
      assistant("hi there"),
    ]);
  });

  it("includes two completed exchanges for the third message", () => {
    const stored = [
      user("hello", 1),
      assistant("hi there"),
      user("how are you doing", 2),
      assistant("doing fine"),
      user("Im bored", 3),
    ];
    expect(historyBeforeMessageId(stored, 3)).toEqual([
      user("hello", 1),
      assistant("hi there"),
      user("how are you doing", 2),
      assistant("doing fine"),
    ]);
  });
});

describe("insertIndexAfterMessageId", () => {
  it("places assistant rows after all rows for the anchor message", () => {
    const stored = [
      user("caption", 9),
      user("image note", 9),
      user("next", 10),
    ];
    expect(insertIndexAfterMessageId(stored, 9)).toBe(2);
  });
});
