import OpenAI from "openai";
import { config } from "../config/index.js";
import { getSettings } from "../db/index.js";
import {
  checkHealthFor,
  listModelsFrom,
  type LlmModel,
} from "./client.js";

/**
 * Vector dimension the `chat_summaries.embedding` column is sized to. The chosen
 * embedding model must emit vectors of this length (1024 fits e.g. bge-m3);
 * switching to a different-dimension model requires recreating the table.
 */
export const EMBEDDING_DIM = 1024;

function resolveOpenAiBaseUrl(): string {
  const host = config.embeddingBaseUrl.trim().replace(/\/$/, "");
  if (!host) {
    throw new Error(
      "Embedding base URL is not configured (set EMBEDDING_BASE_URL or LLM_BASE_URL in .env)",
    );
  }
  return host.endsWith("/v1") ? host : `${host}/v1`;
}

function embeddingsClient(): OpenAI {
  return new OpenAI({
    apiKey: config.embeddingApiKey || "not-needed",
    baseURL: resolveOpenAiBaseUrl(),
    maxRetries: 0,
  });
}

/** List models available on the embedding host (may differ from the chat LLM host). */
export async function listEmbeddingModels(): Promise<LlmModel[]> {
  return listModelsFrom(config.embeddingBaseUrl, config.embeddingApiKey);
}

/** Health-check the embedding host. */
export async function checkEmbeddingHealth(): Promise<void> {
  return checkHealthFor(config.embeddingBaseUrl, config.embeddingApiKey);
}

/**
 * Embed one or more texts via the dashboard-configured embedding model on the
 * OpenAI-compatible `/v1/embeddings` endpoint. Returns one vector per input, in
 * order. Throws when no embedding model is configured.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = (await getSettings()).embeddingModel.trim();
  if (!model) {
    throw new Error(
      "No embedding model configured (set one in the dashboard Settings → Embedding model)",
    );
  }
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
