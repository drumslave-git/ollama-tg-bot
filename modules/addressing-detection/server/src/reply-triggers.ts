import type {
  PipelineModuleHost,
  PipelineStepResult,
} from "@llm-tg-bot/modules-registry";

function senderLabel(from: unknown): string {
  if (!from || typeof from !== "object") return "Someone";
  const user = from as {
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    "Someone"
  );
}

export const replyTriggersHost: PipelineModuleHost = {
  id: "addressing-detection",
  stepId: "triggers",
  alwaysOn: true,

  async run(state, services): Promise<PipelineStepResult> {
    const settings = services.callbacks.getSettings?.() ?? {};
    const inGroup = Boolean(state.inGroup);
    const randomRoll =
      settings.randomReplyEnabled && inGroup ? Math.random() * 100 : null;
    const randomHit =
      settings.randomReplyEnabled &&
      inGroup &&
      randomRoll != null &&
      randomRoll < Number(settings.randomReplyChance ?? 0);
    const hasUserImage = services.callbacks.messageHasUserImage?.(
      state.telegram.message,
    );
    const imageHit =
      settings.reactToEveryImage &&
      inGroup &&
      !randomHit &&
      Boolean(hasUserImage);

    services.logging.logEvent("message_address_gate", {
      turnId: state.turnId,
      chatId: state.chatId,
      randomHit,
      imageHit,
      randomReplyEnabled: settings.randomReplyEnabled,
      randomReplyChance: settings.randomReplyChance,
      randomRoll: randomRoll == null ? undefined : Number(randomRoll.toFixed(2)),
      reactToEveryImage: settings.reactToEveryImage,
    });

    if (randomHit) {
      state.shouldReply = true;
      state.replyTrigger = "random";
      state.skipAddressCheck = true;
      state.addressed = false;
      return {
        status: "ok",
        phaseId: "triggers",
        phaseTitle: "Reply triggers",
        summary: "Random reply triggered",
      };
    }

    if (imageHit) {
      state.shouldReply = true;
      state.replyTrigger = "image";
      state.skipAddressCheck = true;
      state.addressed = false;
      return {
        status: "ok",
        phaseId: "triggers",
        phaseTitle: "Reply triggers",
        summary: "Image reply triggered",
      };
    }

    return {
      status: "skipped",
      phaseId: "triggers",
      phaseTitle: "Reply triggers",
      summary: "No alternate trigger",
    };
  },
};

export { senderLabel };
