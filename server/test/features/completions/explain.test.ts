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
      resolveCommandText: () => ({ text: "why?", fromReply: false }),
      buildTurnInput: () => null,
      deps: {} as never,
    };

    await handleExplainCommand({}, makeServices(extension, replyToUser));

    expect(replyToUser).toHaveBeenCalledWith(
      {},
      "Only the bot owner can use /explain.",
    );
  });

  it("frames reply-only /explain as a meta question", async () => {
    const buildTurnInput = vi.fn().mockReturnValue({
      convKey: "c1",
      chatId: 1,
      userId: "1",
      groupChatId: null,
      inGroup: false,
      question: "",
      userRole: null,
      userMemoryFacts: [],
      groupMemoryFacts: [],
      generalMemoryFacts: [],
    });
    const extension = {
      isOwner: () => true,
      resolveCommandText: () => ({
        text: "Chaos is the only truth.",
        fromReply: true,
      }),
      buildTurnInput,
      deps: {
        logging: {
          logEvent: vi.fn(),
          logEventError: vi.fn(),
        },
        getSettings: () => ({}),
        resolveActivePersonalityId: () => null,
        getPersonalityById: () => null,
        buildExplainSystemPrompt: () => "system",
        ensureHistoryFits: vi.fn().mockResolvedValue(undefined),
        loadHistoryMessages: () => [],
        getMainReplyResponseFormat: () => ({}),
        chatCompleteDetailed: vi.fn().mockResolvedValue({
          raw: '{"reply":"Because the personality says so."}',
        }),
        extractTelegramReply: (raw: string) => raw,
        hasVisibleTelegramReply: () => true,
        prepareTelegramHtml: (html: string) => html,
        recordExchange: vi.fn(),
        recordReply: vi.fn(),
        recordError: vi.fn(),
        sendChunkedHtmlReply: vi.fn().mockResolvedValue({ chunkCount: 1 }),
        deliverHtmlErrorReply: vi.fn(),
      },
    };

    await handleExplainCommand({}, makeServices(extension));

    expect(buildTurnInput).toHaveBeenCalledWith(
      {},
      expect.stringContaining("The owner used /explain on a specific bot message"),
    );
    expect(buildTurnInput).toHaveBeenCalledWith(
      {},
      expect.stringContaining("Chaos is the only truth."),
    );
  });
});
