/**
 * RAG — ingestion and vector search over campaign lore.
 *
 * Storage uses pgvector through raw SQL (the vector type lives
 * outside Prisma's portable type system). Embeddings are generated
 * with the OpenAI embeddings API via a server-side key.
 */
import { prisma } from "../db";
import { chunkText } from "./chunk";
import { embedBatch, embedText } from "./embed";

/** Provenance tags for lore chunks. */
export type LoreSource = "Journal" | "Character" | "SettingNotes" | "Rules" | "Scene";

/**
 * Ingest a document into campaign lore: chunk, embed, store.
 * Existing chunks from the same source document are replaced.
 */
export async function ingestDocument(
  apiKey: string,
  campaignId: string,
  source: LoreSource,
  sourceId: string,
  text: string,
): Promise<number> {
  // Replace previous version of this source.
  await prisma.loreChunk.deleteMany({ where: { campaignId, source, sourceId } });

  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const vectors = await embedBatch(
    apiKey,
    chunks.map((c) => c.content),
  );

  // Insert chunk-by-chunk (batches are small; clarity over cleverness).
  for (let i = 0; i < chunks.length; i++) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "LoreChunk" ("id", "campaignId", "source", "sourceId", "chunkIndex", "content", "embedding", "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::vector, now())`,
      campaignId,
      source,
      sourceId,
      chunks[i].index,
      chunks[i].content,
      JSON.stringify(vectors[i]),
    );
  }

  return chunks.length;
}

export interface LoreHit {
  content: string;
  source: string;
  sourceId: string | null;
  /** Cosine distance (smaller = more relevant). */
  distance: number;
}

/** Semantic search over campaign lore. Returns top-k chunks. */
export async function searchLore(
  campaignId: string,
  query: string,
  limit = 5,
): Promise<LoreHit[]> {
  const apiKey = resolveEmbeddingKey();
  if (!apiKey) return [];

  const queryVector = await embedText(apiKey, query);
  const vectorLiteral = JSON.stringify(queryVector);

  const rows = await prisma.$queryRawUnsafe<
    Array<{ content: string; source: string; sourceId: string | null; distance: number }>
  >(
    `SELECT content, source, "sourceId",
            embedding <=> $2::vector AS distance
     FROM "LoreChunk"
     WHERE "campaignId" = $1 AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    campaignId,
    vectorLiteral,
    limit,
  );

  return rows;
}

/** Simple keyword fallback when embeddings are unavailable. */
export async function searchLoreKeyword(
  campaignId: string,
  query: string,
  limit = 5,
): Promise<LoreHit[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ content: string; source: string; sourceId: string | null }>
  >(
    `SELECT content, source, "sourceId"
     FROM "LoreChunk"
     WHERE "campaignId" = $1 AND content ILIKE '%' || $2 || '%'
     LIMIT $3`,
    campaignId,
    query,
    limit,
  );
  return rows.map((r) => ({ ...r, distance: 1 }));
}

/** Server-side OpenAI key used for embeddings. */
function resolveEmbeddingKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}
