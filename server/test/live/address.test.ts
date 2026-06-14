import { describe, expect, it } from "vitest";
import {
  buildAddressAnalyzerMessages,
  parseAddressDecision,
} from "../../src/bot/address-analyze-prompt.js";
import { liveClient, liveConfig, runAuxiliary } from "./helpers.js";

const cfg = liveConfig();

const BOT_LABELS = "@arguella_bot, Arguella, Аргуэлла";

async function decide(text: string): Promise<boolean> {
  const client = liveClient(cfg!);
  const messages = buildAddressAnalyzerMessages({
    botLabels: BOT_LABELS,
    chatType: "group",
    sender: "Georg",
    text,
  });
  const { content } = await runAuxiliary(client, cfg!.model, messages, {
    numPredict: 192,
  });
  return parseAddressDecision(content);
}

describe.skipIf(!cfg)("live: address detection (group name-variant analyzer)", () => {
  it("says yes for an unambiguous @username mention", async () => {
    expect(await decide("@arguella_bot ping, you there?")).toBe(true);
  });

  it("says no when humans clearly chat among themselves", async () => {
    expect(await decide("Georg, did you finish the report yesterday?")).toBe(
      false,
    );
  });

  it("says no for a generic question with no bot name", async () => {
    expect(await decide("does anyone know what time the shop closes?")).toBe(
      false,
    );
  });

  // LLM output is non-deterministic, so the broader behavioural cases are
  // judged on aggregate accuracy rather than every single classification.
  it("classifies positive (named) cases with high accuracy", async () => {
    const positives = [
      "Arguella, what do you think about this?",
      "hey Arguella can you summarize this thread?",
      "Аргуэлла, привет, как дела?",
      "@arguella_bot translate this please",
    ];
    let correct = 0;
    for (const text of positives) {
      if (await decide(text)) correct += 1;
    }
    expect(correct, `only ${correct}/${positives.length} named cases detected`)
      .toBeGreaterThanOrEqual(3);
  });

  it("classifies negative (not-addressed) cases with high accuracy", async () => {
    const negatives = [
      "lunch at 1pm everyone?",
      "I think the build is broken again",
      "some bot could probably answer that, lol",
      "the weather is awful today",
    ];
    let correct = 0;
    for (const text of negatives) {
      if (!(await decide(text))) correct += 1;
    }
    expect(correct, `only ${correct}/${negatives.length} negatives rejected`)
      .toBeGreaterThanOrEqual(3);
  });
});
