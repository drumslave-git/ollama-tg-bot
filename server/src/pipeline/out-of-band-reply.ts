import { getMainReplyResponseFormat } from "../features/completions/response-format.js";
import {
  getActivePersonalityPrompt,
  getEffectiveMood,
} from "../features/mood/db/index.js";
import { getSettings } from "../db/index.js";
import { chatCompleteDetailed } from "../llm/client.js";
import {
  buildSystemPrompt,
  buildTurnContextBlocks,
} from "./adapters/system-prompt.js";
import { getResolvedSettings } from "../settings/runtime.js";
import { getMaintenanceAnnounceNumPredict } from "../settings/limits.js";
import { getOwnerUserId, getOwnerUsername } from "../bot/owner/owner.js";
import { getRecorder } from "../debug/processing-recorder.js";

export interface OutOfBandReplyOptions {
  /** User-role instruction describing the in-character message to produce. */
  userMessage: string;
  isGroupChat?: boolean;
  entityId?: string;
  traceLabel?: string;
  traceTurnId?: number;
}

/**
 * Generate one in-character model reply outside the normal turn pipeline —
 * used by scheduled task fires and maintenance announcements. Builds the
 * personality/mood system prompt and runs a single auxiliary completion,
 * returning the raw model output; callers parse the reply field themselves
 * (loosely via extractTelegramReply, or strictly when bad output must abort).
 */
export async function generateOutOfBandReplyRaw(
  opts: OutOfBandReplyOptions,
): Promise<string> {
  const settings = getResolvedSettings(await getSettings());
  const customPrompt = await getActivePersonalityPrompt();
  const mood = await getEffectiveMood();
  const systemPrompt = buildSystemPrompt({
    settings,
    customPrompt,
    knownChatUsers: [],
    ownerUserId: await getOwnerUserId(),
    ownerUsername: await getOwnerUsername(),
  });
  // Session and mood are per-turn context and live in the user message (same
  // layout as normal turns), keeping the system prompt cache-stable.
  const turnContext = buildTurnContextBlocks({
    session:
      opts.entityId != null
        ? { entityId: opts.entityId, now: new Date() }
        : null,
    mood,
  });
  const userContent = turnContext
    ? `${turnContext}\n\n${opts.userMessage}`
    : opts.userMessage;

  const report =
    opts.traceTurnId != null ? getRecorder(opts.traceTurnId) : undefined;
  report?.okPhase(
    "prompt-assembly",
    "Prompt assembly",
    `${customPrompt ? "custom" : "default"} personality · mood applied · ${systemPrompt.length} chars`,
    undefined,
    { customPersonality: customPrompt != null, mood, systemPromptChars: systemPrompt.length },
  );

  const { raw } = await chatCompleteDetailed(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    {
      auxiliary: true,
      responseFormat: getMainReplyResponseFormat(),
      numPredict: getMaintenanceAnnounceNumPredict(settings),
      ...(opts.traceLabel != null ? { traceLabel: opts.traceLabel } : {}),
      ...(opts.traceTurnId != null ? { traceTurnId: opts.traceTurnId } : {}),
    },
  );

  return raw;
}
