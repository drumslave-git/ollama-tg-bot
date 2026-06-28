import { getMainReplyResponseFormat } from "../features/completions/response-format.js";
import {
  getActivePersonalityPrompt,
  getEffectiveMood,
} from "../features/mood/db/index.js";
import { getSettings } from "../db/index.js";
import { chatCompleteDetailed } from "../llm/client.js";
import { buildSystemPrompt } from "./adapters/system-prompt.js";
import { getResolvedSettings } from "../settings/runtime.js";
import { getMaintenanceAnnounceNumPredict } from "../settings/limits.js";
import { getOwnerUserId, getOwnerUsername } from "../bot/owner/owner.js";

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
  const systemPrompt = buildSystemPrompt({
    settings,
    customPrompt: await getActivePersonalityPrompt(),
    knownChatUsers: [],
    isGroupChat: opts.isGroupChat ?? false,
    ownerUserId: await getOwnerUserId(),
    ownerUsername: await getOwnerUsername(),
    mood: await getEffectiveMood(),
    ...(opts.entityId != null ? { entityId: opts.entityId } : {}),
  });

  const { raw } = await chatCompleteDetailed(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: opts.userMessage },
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
