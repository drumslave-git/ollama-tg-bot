import { describe, expect, it } from "vitest";
import {
  buildReplyFormatSpec,
  extractTelegramReply,
} from "../../../src/features/completions/response-format.js";

describe("extractTelegramReply", () => {
  const cases: { name: string; in: string; want: string }[] = [
    {
      name: "passes plain text through",
      in: "just some random text",
      want: "just some random text",
    },
    {
      name: "keeps multiline text",
      in: "line one\nline two",
      want: "line one\nline two",
    },
    {
      name: "trims surrounding whitespace",
      in: "  hello  \n",
      want: "hello",
    },
    {
      name: "empty stays empty",
      in: "",
      want: "",
    },
    {
      name: "does not unwrap a JSON reply object",
      in: '{"reply":"hello"}',
      want: '{"reply":"hello"}',
    },
    {
      name: "leaves history-like markup untouched",
      in: "[user:bob:42 said]: hi there",
      want: "[user:bob:42 said]: hi there",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(extractTelegramReply(c.in)).toBe(c.want);
    });
  }
});

describe("buildReplyFormatSpec", () => {
  it("asks for plain text, not a JSON wrapper, and includes the format hint", () => {
    const spec = buildReplyFormatSpec("HINT-TEXT");
    expect(spec).toContain("plain text");
    expect(spec).toContain("HINT-TEXT");
    expect(spec).not.toContain("Respond with JSON only");
    expect(spec).not.toContain("reply (string)");
  });

  it("never asks for a reasoning field", () => {
    const spec = buildReplyFormatSpec("HINT-TEXT");
    expect(spec).not.toContain("reasoning");
  });
});
