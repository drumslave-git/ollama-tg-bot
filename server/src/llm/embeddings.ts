import OpenAI from "openai";
import { config } from "../config/index.js";
import { getSettings } from "../db/index.js";

/** bge-m3 embedding dimension. The chat_summaries vector column is sized to this. */
export const EMBEDDING_DIM = 1024;

function resolveOpenAiBaseUrl(): string {
  const host = config.llmBaseUrl.trim().replace(/\/$/, "");
  if (!host) {
    throw new Error("LLM base URL is not configured (set LLM_BASE_URL in .env)");
  }
  return host.endsWith("/v1") ? host : `${host}/v1`;
}

function embeddingsClient(): OpenAI {
  return new OpenAI({
    apiKey: config.llmApiKey || "not-needed",
    baseURL: resolveOpenAiBaseUrl(),
    maxRetries: 0,
  });
}

/**
 * Embed one or more texts via the configured embedding model (ollama bge-m3 by
 * default) on the OpenAI-compatible `/v1/embeddings` endpoint. Returns one
 * vector per input, in order.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = (await getSettings()).embeddingModel;
  const response = await embeddingsClient().embeddings.create({
    model,
    input: texts,
  });
  return response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[]);
}

/** Embed a single text and return its vector. */
export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  if (!vector) throw new Error("Embedding request returned no vector");
  return vector;
}

/** Format a vector as a pgvector text literal: `[1,2,3]`. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
