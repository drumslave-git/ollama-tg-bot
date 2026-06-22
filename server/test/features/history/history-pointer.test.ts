import { describe, expect, it } from "vitest";
import {
  formatHistoryPointer,
  parseHistoryPointer,
} from "../../../src/features/history/history-pointer.js";

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
