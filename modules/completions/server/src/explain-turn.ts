import type { ChatMessage } from "@llm-tg-bot/modules-utils";
import type { ExplainTurnDeps, ExplainTurnInput } from "./explain-types.js";

export async function runExplainTurn(
  ctx: unknown,
  input: ExplainTurnInput,
  deps: ExplainTurnDeps,
): Promise<void> {
  const settings = deps.getSettings();

  const turnLog = {
    chatId: input.chatId,
    userId: input.userId,
    groupId: input.groupChatId,
    convKey: input.convKey,
    inGroup: input.inGroup,
  };

  try {
    deps.logging.logEvent("explain_turn_started", turnLog);

    const activeId = deps.resolveActivePersonalityId(
      settings.activePersonalityId,
    );
    const activePersonality = activeId ? deps.getPersonalityById(activeId) : null;

    const system = deps.buildExplainSystemPrompt({
      settings,
      activePersonalityName: activePersonality?.name ?? null,
      activePersonalityPrompt: activePersonality?.prompt ?? null,
      generalMemoryFacts: input.generalMemoryFacts,
      groupMemoryFacts: input.groupMemoryFacts,
      userMemoryFacts: input.userMemoryFacts,
      isGroupChat: input.inGroup,
    });

    await deps.ensureHistoryFits(input.convKey);
    const history = deps.loadHistoryMessages(input.convKey);
    const latestContent = `Question: ${input.question.trim()}`;
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      ...history,
      { role: "user", content: latestContent },
    ];

    deps.logging.logEvent("llm_reply_started", { ...turnLog, mode: "explain" });
    const { raw: modelOutput, thinking } = await deps.chatCompleteDetailed(
      messages,
      {
        think: true,
        responseFormat: deps.mainReplyResponseFormat,
      },
    );
    deps.logging.logEvent("llm_reply_done", {
      ...turnLog,
      mode: "explain",
      outputChars: modelOutput.length,
    });

    const replyBody = deps.extractTelegramReply(modelOutput);
    if (!deps.hasVisibleTelegramReply(replyBody)) {
      throw new Error("Model response had no reply content");
    }

    deps.recordExchange(
      input.convKey,
      input.userRole,
      `[explain] ${input.question.trim()}`,
      replyBody,
    );

    const sendThinking =
      Boolean(settings.thinkingEnabled) && Boolean(settings.sendThinkingEnabled);
    const { chunkCount } = await deps.sendChunkedHtmlReply(ctx, {
      chatId: input.chatId,
      html: deps.prepareTelegramHtml(replyBody),
      thinking,
      sendThinking,
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
  }
}
