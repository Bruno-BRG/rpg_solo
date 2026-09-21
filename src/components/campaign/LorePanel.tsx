"use client";
/**
 * Lore panel — shows what the AI remembers about this campaign.
 * Lore chunks are ingested from setting notes, characters and
 * journal entries (RAG pipeline).
 */
import { useEffect, useState } from "react";

interface Chunk { id: string; source: string; content: string; chunkIndex: number; }

export function LorePanel({ campaignId }: { campaignId: string }) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Reuses the campaign endpoint; lore lives on the campaign record.
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (res.ok) {
        // loreChunks are not in the campaign payload; fetch raw via lore route
        const loreRes = await fetch(`/api/campaigns/${campaignId}/lore`);
        if (loreRes.ok) {
          const data = await loreRes.json();
          setChunks(data.chunks);
        }
      }
      setLoading(false);
    })();
  }, [campaignId]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="mb-4 text-sm text-ink-500">
        Campaign memory — setting notes, character backgrounds and journal
        entries embedded for retrieval. The GM searches this before narrating.
      </p>
      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : chunks.length === 0 ? (
        <p className="panel p-6 text-center text-sm text-ink-500">
          Memory is empty. Add setting notes or characters with backgrounds.
        </p>
      ) : (
        <ul className="space-y-2">
          {chunks.map((c) => (
            <li key={c.id} className="panel px-3 py-2 text-sm">
              <span className="tag mr-2">{c.source}</span>
              <span className="text-ink-600">{c.content.slice(0, 180)}…</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
