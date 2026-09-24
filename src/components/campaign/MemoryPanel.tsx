"use client";
/**
 * Memory panel — the campaign's knowledge base.
 *
 * Top half: the facts the GM must never forget, editable by the player
 * (the player is the authority on their own canon). Bottom half: what is
 * actually indexed for retrieval, with a count per source.
 */
import { useCallback, useEffect, useState } from "react";

interface Fact {
  id: string;
  category: string;
  text: string;
  importance: number;
  status: string;
  sourceKind: string;
}

interface Chunk { id: string; source: string; content: string; chunkIndex: number; }
interface SourceCount { source: string; count: number; }

const CATEGORIES = [
  "Character",
  "Location",
  "Faction",
  "Item",
  "Event",
  "Promise",
  "Ruling",
  "Mystery",
];

export function MemoryPanel({
  campaignId,
  refreshKey = 0,
}: {
  campaignId: string;
  refreshKey?: number;
}) {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [sources, setSources] = useState<SourceCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category: "Character", text: "", importance: 2 });
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [campaignRes, loreRes] = await Promise.all([
      fetch(`/api/campaigns/${campaignId}`),
      fetch(`/api/campaigns/${campaignId}/lore`),
    ]);
    if (campaignRes.ok) {
      const data = await campaignRes.json();
      setFacts(data.campaign.facts ?? []);
    }
    if (loreRes.ok) {
      const data = await loreRes.json();
      setChunks(data.chunks ?? []);
      setSources(data.sources ?? []);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  async function addFact(e: React.FormEvent) {
    e.preventDefault();
    if (!form.text.trim()) return;
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "facts",
        category: form.category,
        text: form.text.trim(),
        importance: form.importance,
        sourceKind: "Player",
      }),
    });
    if (!res.ok) setError("Could not save that fact.");
    else setForm({ ...form, text: "" });
    await refresh();
  }

  async function patchFact(id: string, body: Record<string, unknown>) {
    setFacts((list) => list.map((f) => (f.id === id ? { ...f, ...body } as Fact : f)));
    await fetch(`/api/campaigns/${campaignId}/story`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "facts", id, ...body }),
    });
    await refresh();
  }

  async function removeFact(id: string) {
    await fetch(`/api/campaigns/${campaignId}/story?resource=facts&itemId=${id}`, {
      method: "DELETE",
    });
    await refresh();
  }

  if (loading) return <p className="p-6 text-sm text-ink-500">Loading…</p>;

  const active = facts.filter((f) => f.status === "Active");
  const archived = facts.filter((f) => f.status !== "Active");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <section>
        <h2 className="font-serif text-lg">Facts</h2>
        <p className="mt-1 text-sm text-ink-500">
          What the GM knows for certain. Facts are replayed every turn, so
          correcting one here fixes the story everywhere.
        </p>

        <form onSubmit={addFact} className="mt-4 flex flex-wrap gap-2">
          <select
            className="input w-36"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            className="input min-w-64 flex-1"
            placeholder="e.g. The Tide Queen taxes every sunset at Ember Coast"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
          <select
            className="input w-28"
            value={form.importance}
            onChange={(e) => setForm({ ...form, importance: Number(e.target.value) })}
          >
            <option value={1}>Minor</option>
            <option value={2}>Normal</option>
            <option value={3}>Critical</option>
          </select>
          <button className="btn-primary" disabled={!form.text.trim()}>Add fact</button>
        </form>
        {error && <p className="mt-2 text-sm text-accent">{error}</p>}

        <ul className="mt-4 space-y-2">
          {active.map((fact) => (
            <li key={fact.id} className="panel flex items-start gap-2 px-3 py-2 text-sm">
              <span className="tag shrink-0">{fact.category}</span>
              {fact.importance >= 3 && <span className="tag shrink-0 border-accent text-accent">Critical</span>}
              <span className="flex-1">{fact.text}</span>
              <span className="mono shrink-0 text-[10px] text-ink-400">{fact.sourceKind}</span>
              <button
                className="shrink-0 text-ink-400 hover:text-accent"
                title="Archive (the GM stops seeing it)"
                onClick={() => patchFact(fact.id, { status: "Archived" })}
              >
                archive
              </button>
            </li>
          ))}
          {active.length === 0 && (
            <li className="panel px-3 py-2 text-sm text-ink-500">
              No facts recorded yet. The GM records them as you play — or add one yourself.
            </li>
          )}
        </ul>

        {archived.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-ink-500">
              Archived ({archived.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {archived.map((fact) => (
                <li key={fact.id} className="flex items-center gap-2 text-sm text-ink-500">
                  <span className="tag">{fact.category}</span>
                  <span className="flex-1 line-through">{fact.text}</span>
                  <button className="hover:text-accent" onClick={() => patchFact(fact.id, { status: "Active" })}>
                    restore
                  </button>
                  <button className="hover:text-accent" onClick={() => removeFact(fact.id)}>
                    delete
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section>
        <h2 className="font-serif text-lg">Indexed memory</h2>
        <p className="mt-1 text-sm text-ink-500">
          Notes, backgrounds, journal entries and facts, chunked for retrieval.
          {sources.length > 0 && (
            <> Indexed: {sources.map(({ source, count }) => `${source} (${count})`).join(", ")}.</>
          )}
        </p>
        {chunks.length === 0 ? (
          <p className="panel mt-3 p-4 text-center text-sm text-ink-500">
            Memory is empty. Add setting notes, a character background, or play a scene.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {chunks.slice(0, 50).map((c) => (
              <li key={c.id} className="panel px-3 py-2 text-sm">
                <span className="tag mr-2">{c.source}</span>
                <span className="text-ink-600">{c.content.slice(0, 180)}…</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
