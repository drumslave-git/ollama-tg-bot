import { describe, expect, it, vi } from "vitest";
import { EXPLAIN_EXTENSION_ID } from "../src/explain-types.js";
import { handleExplainCommand } from "../src/explain-command.js";
import { botHost } from "../src/bot-host.js";

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
      resolveCommandText: () => "why?",
      buildTurnInput: () => null,
      deps: {} as never,
    };

    await handleExplainCommand(
      {},
      {
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
      },
    );

    expect(replyToUser).toHaveBeenCalledWith(
      {},
      "Only the bot owner can use /explain.",
    );
  });
});
