import { describe, expect, it } from "vitest";
import { detectAddressing } from "../src/detect.js";

interface LiveConfig {
  baseURL: string;
  model: string;
  apiKey: string;
}

function liveConfig(): LiveConfig | null {
  const rawBase = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!rawBase || !model) return null;
  const baseURL = rawBase.endsWith("/v1") ? rawBase : `${rawBase}/v1`;
  return {
    baseURL,
    model,
    apiKey: (process.env.OPENAI_API_KEY ?? "").trim() || "not-needed",
  };
}

const cfg = liveConfig();
const BOT_ALIASES = ["arguella_bot", "Arguella", "Аргуэлла"];

async function decide(text: string): Promise<boolean> {
  const result = await detectAddressing(
    { message: text, sender: "Georg", chatType: "group" },
    {
      baseUrl: cfg!.baseURL.replace(/\/v1$/, ""),
      model: cfg!.model,
      apiKey: cfg!.apiKey,
      botAliases: BOT_ALIASES,
      numPredict: 192,
    },
  );
  return result.result;
}

describe.skipIf(!cfg)("live: addressing-detection module", () => {
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
