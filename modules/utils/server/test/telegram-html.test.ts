import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  hasVisibleTelegramReply,
  prepareTelegramHtml,
  visibleTelegramText,
} from "../src/telegram-html.js";

describe("prepareTelegramHtml", () => {
  it("converts markdown bold to <b>", () => {
    expect(prepareTelegramHtml("**bold** and __also__")).toBe(
      "<b>bold</b> and <b>also</b>",
    );
  });

  it("closes unbalanced tags", () => {
    expect(prepareTelegramHtml("<b>open")).toBe("<b>open</b>");
  });

  it("drops a stray closing tag with no opener", () => {
    expect(prepareTelegramHtml("text</b>")).toBe("text");
  });

  it("maps unsupported block tags to newlines", () => {
    expect(prepareTelegramHtml("<p>one</p><p>two</p>")).toBe("one\n\ntwo");
  });

  it("normalizes <strong>/<em> to <b>/<i>", () => {
    expect(prepareTelegramHtml("<strong>a</strong> <em>b</em>")).toBe(
      "<b>a</b> <i>b</i>",
    );
  });

  it("converts spoiler span to tg-spoiler", () => {
    expect(prepareTelegramHtml('<span class="tg-spoiler">x</span>')).toBe(
      "<tg-spoiler>x</tg-spoiler>",
    );
  });

  it("collapses 3+ newlines to a paragraph break", () => {
    expect(prepareTelegramHtml("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("visibleTelegramText", () => {
  it("strips tags and decodes entities", () => {
    expect(visibleTelegramText("<b>Hi</b> &amp; bye")).toBe("Hi & bye");
  });
});

describe("hasVisibleTelegramReply", () => {
  it("is false for empty tag shells", () => {
    expect(hasVisibleTelegramReply("<b></b>")).toBe(false);
  });

  it("is true for real text", () => {
    expect(hasVisibleTelegramReply("hello")).toBe(true);
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#039;&amp;&#039;&lt;/a&gt;",
    );
  });
});
