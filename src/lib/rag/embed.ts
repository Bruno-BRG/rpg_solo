/**
 * RAG — embedding generation.
 *
 * Uses the active AI provider's embeddings endpoint. The OpenAI
 * API provider is always used for embeddings (the ChatGPT
 * subscription flow does not expose an embeddings endpoint);
 * this keeps RAG functional regardless of the chat provider.
 */
import OpenAI from "openai";

const EMBED_MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";

/** Embed a single text into a float array. */
export async function embedText(
  apiKey: string,
  text: string,
): Promise<number[]> {
  const client = new OpenAI({ apiKey });
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

/** Embed a batch of texts (one API call, ordered results). */
export async function embedBatch(
  apiKey: string,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = new OpenAI({ apiKey });
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
