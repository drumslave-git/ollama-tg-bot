/**
 * Plain-text output spec for the /explain pass. Like the main reply, explain
 * output is plain text with no JSON wrapper — grammar-constrained decoding pushes
 * models into repetition loops, and the owner just wants the prose explanation.
 */
export function buildExplainFormatSpec(): string {
  return `Reply with your explanation only — plain text, no JSON, no wrapper, no field labels.

Output rules (mandatory):
- Output only your explanation, nothing before or after it.
- Do NOT roleplay. Do NOT speak as the bot's character or continue its dialogue.
- Explain which configuration, memory, or chat history caused the behavior.
- Write in clear, direct prose. Match the owner's language when they asked in one; otherwise use English.
- Quote or paraphrase the relevant instruction or memory when it explains the behavior.`;
}

export function buildReplyFormatSpec(formatHint: string): string {
  return `Reply with your spoken message only — plain text, no JSON, no wrapper, no field labels.

Output rules (mandatory):
- Output only your spoken reply, nothing before or after it.
- Do not fake actions in words: saying in this reply that you saved, remembered, noted, scheduled, or looked something up does NOT perform it — only an actual tool call does. Either emit the tool call this turn, or do not claim you did it. When a tool is needed, call it first, then write your reply.
- Never include internal chat-history tags (e.g. [assistant said], [user:… said], [sticker: …], [compressed]) — those are metadata, not spoken text.
- Do not copy broken formatting, garbled markup, or error-like phrasing from chat history.
- Formatting: HTML tags are optional — reply in plain text unless a tag genuinely adds emphasis. Never send empty tags (e.g. <b></b>).

Reply length and style:
${formatHint}`;
}

/** The user-facing Telegram reply from plain-text model output. */
export function extractTelegramReply(content: string): string {
  return content.trim();
}
