import { describe, expect, it, vi } from "vitest";
import { EXPLAIN_EXTENSION_ID } from "../../../src/features/completions/explain-types.js";
import { handleExplainCommand } from "../../../src/features/completions/explain-command.js";
import { botHost } from "../../../src/features/completions/bot-host.js";

function makeServices(
  extension: Record<string, unknown>,
  replyToUser = vi.fn().mockResolvedValue(undefined),
) {
  return {
    api: {},
    botUsername: "TestBot",
    botToken: "token",
    logging: {
      logEvent: vi.fn(),
      logEventError: vi.fn(),
    },
    getSettings: () => ({}),
    replyToUser,
    extensions: {
      [EXPLAIN_EXTENSION_ID]: extension,
    },
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    logging: { logEvent: vi.fn(), logEventError: vi.fn() },
    getSettings: () => ({}),
    resolveActivePersonalityId: () => null,
    getPersonalityById: () => null,
    buildExplainSystemPrompt: vi.fn().mockReturnValue("system"),
    getMainReplyResponseFormat: () => ({}),
    chatCompleteDetailed: vi.fn().mockResolvedValue({
      raw: '{"reply":"Because the personality says so."}',
    }),
    extractTelegramReply: (raw: string) => raw,
    hasVisibleTelegramReply: () => true,
    prepareTelegramHtml: (html: string) => html,
    startTyping: vi.fn().mockReturnValue(vi.fn()),
    recordReply: vi.fn(),
    recordError: vi.fn(),
    sendChunkedHtmlReply: vi.fn().mockResolvedValue({ chunkCount: 1, messageIds: [] }),
    deliverHtmlErrorReply: vi.fn(),
    ...overrides,
  };
}

function turnInput(traceText: string | null) {
  return {
    convKey: "c1",
    chatId: 1,
    userId: "1",
    inGroup: false,
    repliedMessageId: 42,
    traceText,
  };
}

describe("explain command", () => {
  it("registers explain on completions bot host", () => {
    expect(botHost.commands?.some((command) => command.command === "explain")).toBe(
      true,
    );
  });

  it("rejects non-owner users", async () => {
    const replyToUser = vi.fn().mockResolvedValue(undefined);
    const extension = {
      isOwner: () => false,
      buildTurnInput: () => null,
      deps: makeDeps(),
    };

    await handleExplainCommand({}, makeServices(extension, replyToUser));

    expect(replyToUser).toHaveBeenCalledWith(
      {},
      "Only the bot owner can use /explain.",
    );
  });

  it("shows a usage hint when not a reply to a bot message", async () => {
    const replyToUser = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps();
    const extension = {
      isOwner: () => true,
      buildTurnInput: () => null,
      deps,
    };

    await handleExplainCommand({}, makeServices(extension, replyToUser));

    expect(replyToUser).toHaveBeenCalledWith(
      {},
      expect.stringContaining("Reply to one of my messages"),
    );
    expect(deps.chatCompleteDetailed).not.toHaveBeenCalled();
  });

  it("explains from the trace when one is found", async () => {
    const deps = makeDeps();
    const extension = {
      isOwner: () => true,
      buildTurnInput: () => turnInput("## Phases\n### Main reply · ok\n"),
      deps,
    };

    await handleExplainCommand({}, makeServices(extension));

    expect(deps.buildExplainSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        traceText: expect.stringContaining("Main reply"),
      }),
    );
    expect(deps.chatCompleteDetailed).toHaveBeenCalledTimes(1);
    expect(deps.sendChunkedHtmlReply).toHaveBeenCalledTimes(1);
    // Typing indicator runs during the wait and is stopped afterwards.
    expect(deps.startTyping).toHaveBeenCalledTimes(1);
    expect(deps.startTyping.mock.results[0]?.value).toHaveBeenCalledTimes(1);
  });

  it("refuses with a note when the replied-to message has no trace", async () => {
    const deps = makeDeps();
    const extension = {
      isOwner: () => true,
      buildTurnInput: () => turnInput(null),
      deps,
    };

    await handleExplainCommand({}, makeServices(extension));

    expect(deps.chatCompleteDetailed).not.toHaveBeenCalled();
    expect(deps.sendChunkedHtmlReply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        html: expect.stringContaining("No debug trace"),
      }),
    );
  });
});
