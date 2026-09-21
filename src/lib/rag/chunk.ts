/**
 * RAG — text chunking.
 *
 * Splits documents into overlapping chunks sized for embeddings.
 * Prefers paragraph boundaries; falls back to hard splits for
 * very long paragraphs (common in pasted rulebook text).
 */

/** Chunk size in characters (≈ 200 tokens for embeddings models). */
const CHUNK_SIZE = 1000;
/** Overlap between consecutive chunks. */
const OVERLAP = 150;

export interface TextChunk {
  content: string;
  index: number;
}

/**
 * Split `text` into chunks. Paragraphs are kept together when
 * possible; oversized paragraphs are hard-split with overlap.
 */
export function chunkText(text: string): TextChunk[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n\s*\n/);
  const chunks: TextChunk[] = [];
  let buffer = "";

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length > 0) {
      chunks.push({ content: trimmed, index: chunks.length });
    }
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;

    if (candidate.length <= CHUNK_SIZE) {
      buffer = candidate;
      continue;
    }

    // Paragraph alone exceeds the limit — flush buffer, hard-split it.
    flush();
    if (paragraph.length <= CHUNK_SIZE) {
      buffer = paragraph;
      continue;
    }
    for (let start = 0; start < paragraph.length; start += CHUNK_SIZE - OVERLAP) {
      const piece = paragraph.slice(start, start + CHUNK_SIZE);
      chunks.push({ content: piece.trim(), index: chunks.length });
      if (start + CHUNK_SIZE >= paragraph.length) break;
    }
  }
  flush();

  return chunks;
}
