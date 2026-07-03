import type { ChatMessage } from "../../shared/index.js";
import type { ExplainTurnDeps, ExplainTurnInput } from "./explain-types.js";

const USER_INSTRUCTION =
  "Explain why the bot sent the message being replied to. " +
  "Base your answer strictly on the execution trace above — cite the system prompt, " +
  "mood, memories, retrieved history, and tool calls that actually shaped the reply.";

export async function runExplainTurn(
  ctx: unknown,
  input: ExplainTurnInput,
  deps: ExplainTurnDeps,
): Promise<void> {
  const settings = await deps.getSettings();

  const turnLog = {
    chatId: input.chatId,
    userId: input.userId,
    convKey: input.convKey,
    inGroup: input.inGroup,
    repliedMessageId: input.repliedMessageId,
  };

  // No stored trace for that message (sent before this feature, or aged out of
  // the per-chat trace cap). Refuse with a note rather than guessing.
  if (!input.traceText) {
    deps.logging.logEvent("explain_no_trace", turnLog);
    await deps.sendChunkedHtmlReply(ctx, {
      chatId: input.chatId,
      html: "No debug trace is stored for that message — it may be too old to explain.",
      messageThreadId: input.messageThreadId,
      inGroup: input.inGroup,
      isForum: input.isForum,
    }).catch(() => {});
    return;
  }

  // Explaining runs a full completion over the trace — keep a typing indicator
  // up for the whole wait so the owner sees progress.
  const stopTyping = deps.startTyping(ctx);
  try {
    deps.logging.logEvent("explain_turn_started", turnLog);

    const activeId = await deps.resolveActivePersonalityId(
      settings.activePersonalityId,
    );
    const activePersonality = activeId
      ? await deps.getPersonalityById(activeId)
      : null;

    const system = deps.buildExplainSystemPrompt({
      settings,
      activePersonalityName: activePersonality?.name ?? null,
      activePersonalityPrompt: activePersonality?.prompt ?? null,
      traceText: input.traceText,
    });

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: USER_INSTRUCTION },
    ];

    deps.logging.logEvent("llm_reply_started", { ...turnLog, mode: "explain" });
    const { raw: modelOutput } = await deps.chatCompleteDetailed(messages, {
      think: Boolean(settings.thinkingEnabled),
    });
    deps.logging.logEvent("llm_reply_done", {
      ...turnLog,
      mode: "explain",
      outputChars: modelOutput.length,
    });

    const replyBody = deps.extractTelegramReply(modelOutput);
    if (!deps.hasVisibleTelegramReply(replyBody)) {
      throw new Error("Model response had no reply content");
    }

    // Note: explain turns are intentionally NOT recorded into chat history —
    // they are owner-facing debug output, not part of the bot's conversation.

    const { chunkCount } = await deps.sendChunkedHtmlReply(ctx, {
      chatId: input.chatId,
      html: deps.prepareTelegramHtml(replyBody),
      messageThreadId: input.messageThreadId,
      inGroup: input.inGroup,
      isForum: input.isForum,
    });

    deps.recordReply(false);
    deps.logging.logEvent("reply_sent", {
      ...turnLog,
      mode: "explain",
      chunkCount,
      replyChars: replyBody.length,
    });
  } catch (err) {
    deps.logging.logEventError("explain_failed", err, turnLog);
    const msg = err instanceof Error ? err.message : "Something went wrong";
    deps.recordError({
      message: msg,
      stack: err instanceof Error ? err.stack : undefined,
      chatId: input.chatId,
      userId: input.userId ?? undefined,
    });
    await deps.deliverHtmlErrorReply(ctx, {
      messageThreadId: input.messageThreadId,
      prefix: "Sorry, I could not get an explanation from the LLM.",
      detail: msg,
      plainFallback: "Sorry, I could not get an explanation from the LLM.",
    }).catch(() => {});
    throw err;
  } finally {
    stopTyping?.();
  }
}
