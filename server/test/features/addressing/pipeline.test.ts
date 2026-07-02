import { describe, expect, it } from "vitest";
import { addressingHost, setBotIdentity } from "../../../src/features/addressing/index.js";
import type {
  PipelineHostServices,
  PipelineTurnState,
} from "../../../src/contracts/index.js";

function makeServices(
  captured: { options?: Record<string, unknown> },
): PipelineHostServices {
  return {
    logging: { logEvent: () => {}, logEventError: () => {} },
    llm: {
      baseUrl: "http://localhost:1",
      model: "test-model",
      createAuxiliaryChatComplete: (options) => {
        captured.options = options as unknown as Record<string, unknown>;
        return async () => '{"addressed": false}';
      },
    },
    getWorkflowSteps: async () => [],
    getReport: () => null,
  };
}

function makeState(): PipelineTurnState {
  return {
    turnId: 1,
    telegram: {
      message: { message_id: 10, text: "hello", date: 0, chat: { id: 5, type: "private" } },
      chat: { id: 5, type: "private" },
      from: { id: 7, first_name: "Alice" },
      me: { id: 99, username: "testbot" },
      botToken: "token",
    },
    rawText: "hello",
    latestBody: "hello",
  };
}

describe("addressingHost", () => {
  it("runs the address check with thinking forced off", async () => {
    // The address gate fires on every unaddressed group message; reasoning
    // tokens there delay every reply, so the host must pass think: false
    // regardless of the global thinkingEnabled setting.
    setBotIdentity({ id: 99, first_name: "Test Bot" }, "testbot");
    const captured: { options?: Record<string, unknown> } = {};

    await addressingHost.run(makeState(), makeServices(captured));

    expect(captured.options).toBeDefined();
    expect(captured.options?.think).toBe(false);
    expect(captured.options?.traceLabel).toBe("address detection");
  });
});
