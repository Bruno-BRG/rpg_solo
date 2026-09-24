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
export type LoreSource =
  | "Journal"
  | "Character"
  | "SettingNotes"
  | "Rules"
  | "Scene"
  | "Fact";

/**
 * Ingest a document into campaign lore: chunk, optionally embed, store.
 * Existing chunks from the same source document are replaced.
 */
export async function ingestDocument(
  apiKey: string | null,
  campaignId: string,
  source: LoreSource,
  sourceId: string,
  text: string,
): Promise<number> {
  const chunks = chunkText(text);
  let vectors: (number[] | null)[] = chunks.map(() => null);
  if (apiKey && chunks.length > 0) {
    try {
      vectors = await embedBatch(apiKey, chunks.map((c) => c.content));
    } catch {
      // Keep the text searchable even when the embedding provider is down.
    }
  }

  // Replace the source atomically so a failed insert never leaves partial or stale chunks.
  await prisma.$transaction(async (tx) => {
    await tx.loreChunk.deleteMany({ where: { campaignId, source, sourceId } });
    for (let i = 0; i < chunks.length; i++) {
      await tx.$executeRawUnsafe(
        `INSERT INTO "LoreChunk" ("id", "campaignId", "source", "sourceId", "chunkIndex", "content", "embedding", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::vector, now())`,
        campaignId,
        source,
        sourceId,
        chunks[i].index,
        chunks[i].content,
        vectors[i] ? JSON.stringify(vectors[i]) : null,
      );
    }
  });

  return chunks.length;
}

/** Backfill text sources created before lore ingestion was available. */
export async function ensureCampaignLoreIndexed(campaignId: string): Promise<void> {
  const [campaign, characters, journal, facts, indexed] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { settingNotes: true } }),
    prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true, background: true } }),
    prisma.journalEntry.findMany({ where: { campaignId }, select: { id: true, title: true, summary: true, body: true } }),
    prisma.campaignFact.findMany({
      where: { campaignId, status: "Active" },
      select: { id: true, category: true, text: true },
    }),
    prisma.loreChunk.findMany({ where: { campaignId }, select: { source: true, sourceId: true }, distinct: ["source", "sourceId"] }),
  ]);
  const present = new Set(indexed.map((row) => `${row.source}:${row.sourceId ?? ""}`));
  const apiKey = resolveEmbeddingKey();
  const missing: Array<{ source: LoreSource; sourceId: string; text: string }> = [];
  if (campaign?.settingNotes?.trim() && !present.has(`SettingNotes:${campaignId}`)) {
    missing.push({ source: "SettingNotes", sourceId: campaignId, text: campaign.settingNotes });
  }
  for (const character of characters) {
    if (character.background?.trim() && !present.has(`Character:${character.id}`)) {
      missing.push({ source: "Character", sourceId: character.id, text: `${character.name}: ${character.background}` });
    }
  }
  for (const entry of journal) {
    if (!present.has(`Journal:${entry.id}`)) {
      missing.push({ source: "Journal", sourceId: entry.id, text: `${entry.title}\n\n${entry.summary ?? ""}\n\n${entry.body}` });
    }
  }
  for (const fact of facts) {
    if (!present.has(`Fact:${fact.id}`)) {
      missing.push({ source: "Fact", sourceId: fact.id, text: `[${fact.category}] ${fact.text}` });
    }
  }
  for (const document of missing) {
    await ingestDocument(apiKey, campaignId, document.source, document.sourceId, document.text);
  }
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
  await ensureCampaignLoreIndexed(campaignId);
  const apiKey = resolveEmbeddingKey();
  if (!apiKey) return searchLoreKeyword(campaignId, query, limit);
  try {
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

    const keywordHits = await searchLoreKeyword(campaignId, query, limit);
    const merged = new Map<string, LoreHit>();
    for (const hit of [...rows, ...keywordHits]) {
      const key = `${hit.source}:${hit.sourceId}:${hit.content}`;
      const current = merged.get(key);
      if (!current || hit.distance < current.distance) merged.set(key, hit);
    }
    const combined: LoreHit[] = [];
    merged.forEach((hit) => combined.push(hit));
    return combined.sort((a, b) => a.distance - b.distance).slice(0, limit);
  } catch {
    return searchLoreKeyword(campaignId, query, limit);
  }
}

/** Simple keyword fallback when embeddings are unavailable. */
export async function searchLoreKeyword(
  campaignId: string,
  query: string,
  limit = 5,
): Promise<LoreHit[]> {
  await ensureCampaignLoreIndexed(campaignId);
  const tokens = (query.toLocaleLowerCase().match(/[a-z0-9À-ÿ]{2,}/g)?.filter((token, index, all) => all.indexOf(token) === index) ?? []).slice(0, 8);
  if (!tokens.length) return [];
  const rankTokens = tokens.map((token) => token.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const normalizedContent = `translate(lower(content), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')`;
  const clauses = rankTokens.map((_, index) => `${normalizedContent} LIKE '%' || $${index + 2} || '%'`).join(" OR ");
  const rows = await prisma.$queryRawUnsafe<
    Array<{ content: string; source: string; sourceId: string | null }>
  >(
    `SELECT content, source, "sourceId"
     FROM "LoreChunk"
     WHERE "campaignId" = $1 AND (${clauses})
     LIMIT 2000`,
    campaignId,
    ...rankTokens,
  );
  return rows
    .map((row) => {
      const content = row.content.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const matched = rankTokens.reduce((count, token) => count + (content.includes(token) ? 1 : 0), 0);
      return { ...row, matched, distance: 1 - matched / rankTokens.length };
    })
    .filter((row) => row.matched > 0)
    .sort((a, b) => b.matched - a.matched)
    .slice(0, limit)
    .map(({ matched: _matched, ...row }) => row);
}

/** Server-side OpenAI key used for embeddings. */
export function resolveEmbeddingKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}
