import { describe, expect, it } from "vitest";
import { sanitizeModelOutput } from "../src/sanitize.js";

describe("sanitizeModelOutput", () => {
  it("removes hex byte tokens", () => {
    expect(sanitizeModelOutput("hi<0x0A><0x09>there")).toBe("hithere");
  });

  it("removes chat template markers", () => {
    expect(sanitizeModelOutput("<|im_start|>hello<|im_end|>")).toBe("hello");
  });

  it("removes a dangling unterminated template marker", () => {
    expect(sanitizeModelOutput("answer<|im_sta")).toBe("answer");
  });

  it("trims a trailing </s> sentinel", () => {
    expect(sanitizeModelOutput("done</s>")).toBe("done");
  });

  it("removes [end of text]", () => {
    expect(sanitizeModelOutput("bye [end of text]")).toBe("bye");
  });

  it("leaves clean text untouched", () => {
    expect(sanitizeModelOutput("  normal text  ")).toBe("normal text");
  });
});
