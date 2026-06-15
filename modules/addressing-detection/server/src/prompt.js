import { asObject, parseJsonContent, readBoolean, strictObjectSchema, } from "@llm-tg-bot/modules-utils";
export const ADDRESS_RESPONSE_FORMAT = strictObjectSchema("address_decision", {
    addressed: {
        type: "boolean",
        description: "True when the message explicitly names this bot and should receive a reply.",
    },
}, ["addressed"]);
export const ANALYZER_SYSTEM = `You decide whether a group-chat message explicitly names a specific Telegram bot and should receive a reply.

Respond with JSON only, matching the provided schema. The object has one field:
- addressed (boolean): true when the bot should reply, false otherwise.

Say addressed=true only when the message contains a reference to the bot identity:
- The bot's username, first name, full name, nickname, or a clear spelling/case/punctuation variation
- A clear translation/transliteration of the bot's name into another language
- A natural-language call to that named bot, such as "<bot name>, what do you think?"

Say addressed=false when:
- Humans are chatting among themselves with no request aimed at the bot
- The bot is not named, even if the message asks a general question or sounds like it wants an assistant
- The message says "bot", "assistant", "AI", or similar generic words without the specific bot name
- It is background banter the bot should not interrupt`;
export function parseAddressDecision(raw) {
    const parsed = asObject(parseJsonContent(raw));
    if (!parsed) {
        return { result: false, reason: "Could not parse LLM address decision" };
    }
    const addressed = readBoolean(parsed, "addressed");
    if (addressed === null) {
        return { result: false, reason: "Could not parse LLM address decision" };
    }
    return {
        result: addressed,
        reason: addressed ? "LLM decision: yes" : "LLM decision: no",
    };
}
export function formatBotLabels(botAliases) {
    const labels = new Set();
    const [username, ...aliases] = botAliases;
    if (username?.trim()) {
        labels.add(`@${username.replace(/^@/, "")}`);
    }
    for (const alias of aliases) {
        if (alias.length >= 3)
            labels.add(alias);
    }
    return [...labels].join(", ");
}
export function buildAddressAnalyzerMessages(params) {
    return [
        { role: "system", content: ANALYZER_SYSTEM },
        {
            role: "user",
            content: `Bot identity (names users may use): ${params.botLabels}\n` +
                `Treat these as bot-name references even when case, punctuation, underscores/spaces, minor spelling, or Latin/Cyrillic transliteration differs.\n` +
                `Chat type: ${params.chatType}\n` +
                `Sender: ${params.sender}\n\n` +
                `Message:\n${params.text.trim() || "(empty or non-text)"}\n\n` +
                `Return JSON with addressed true or false.`,
        },
    ];
}
