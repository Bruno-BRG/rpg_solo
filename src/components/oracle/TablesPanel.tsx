"use client";
/**
 * Tables panel — the d100 table library.
 *
 * Built-in genre packs (fantasy/scifi/western/horror/noir/
 * universal) plus the user's own tables. Every roll is logged to
 * the open scene through /api/oracle.
 */
import { useEffect, useState } from "react";

interface BuiltinTable {
  id: string;
  name: string;
  genre: string;
  description: string;
  size: number;
  sample: string[];
}
interface CustomTable {
  id: string;
  name: string;
  description: string | null;
  entries: string[];
}
interface RollResult {
  tableName: string;
  roll: number;
  text: string;
}

export function TablesPanel({ openSceneId }: { openSceneId: string | null }) {
  const [genres, setGenres] = useState<string[]>([]);
  const [builtin, setBuiltin] = useState<BuiltinTable[]>([]);
  const [custom, setCustom] = useState<CustomTable[]>([]);
  const [genre, setGenre] = useState<string>("all");
  const [last, setLast] = useState<RollResult | null>(null);
  const [history, setHistory] = useState<RollResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom table form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", entries: "" });
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const res = await fetch("/api/tables");
    if (res.ok) {
      const data = await res.json();
      setGenres(data.genres);
      setBuiltin(data.builtin);
      setCustom(data.custom);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function roll(tableId: string) {
    if (!openSceneId) {
      setError("Open a scene first (Story tab → Begin the adventure, or Threads & Cast → Open).");
      return;
    }
    setError(null);
    setBusy(true);
    const res = await fetch("/api/oracle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneId: openSceneId, kind: "Table", tableId }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Roll failed");
      return;
    }
    const data = await res.json();
    const result: RollResult = data.result;
    setLast(result);
    setHistory((h) => [result, ...h].slice(0, 8));
  }

  async function createTable(e: React.FormEvent) {
    e.preventDefault();
    const entries = form.entries
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, description: form.description || undefined, entries }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create the table");
      return;
    }
    setForm({ name: "", description: "", entries: "" });
    setShowForm(false);
    await refresh();
  }

  async function removeTable(id: string) {
    await fetch(`/api/tables/${id}`, { method: "DELETE" });
    await refresh();
  }

  const visible = genre === "all" ? builtin : builtin.filter((t) => t.genre === genre);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {error && (
        <div className="border border-accent bg-accent/5 px-4 py-2 text-sm text-accent">
          {error}
        </div>
      )}

      {/* Last result */}
      {last && (
        <div className="panel">
          <div className="panel-header">d100 · {last.tableName}</div>
          <div className="p-5 text-center">
            <p className="mono text-xs text-ink-400">rolled {last.roll}</p>
            <p className="mt-1 font-serif text-2xl">{last.text}</p>
          </div>
          {history.length > 1 && (
            <div className="border-t border-ink-200 px-4 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">Recent rolls</p>
              <ul className="mt-1 space-y-0.5 text-xs text-ink-600">
                {history.slice(1).map((h, i) => (
                  <li key={i} className="mono truncate">
                    [{h.roll}] {h.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Genre filter */}
      <div className="flex flex-wrap gap-1">
        {["all", ...genres].map((g) => (
          <button
            key={g}
            className={genre === g ? "tag border-accent text-accent" : "tag"}
            onClick={() => setGenre(g)}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Built-in tables */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-500">
          Table library
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((t) => (
            <div key={t.id} className="panel px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {t.name} <span className="tag ml-1">{t.genre}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">{t.description}</p>
                  <p className="mt-1 text-xs italic text-ink-400">
                    e.g. “{t.sample[0]}”
                  </p>
                </div>
                <button className="btn-secondary" disabled={busy} onClick={() => roll(t.id)}>
                  Roll d100
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Custom tables */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-500">
            Your tables
          </h2>
          <button className="btn-secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ New table"}
          </button>
        </div>

        {showForm && (
          <form className="panel space-y-3 p-4" onSubmit={createTable}>
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Alchemy ingredients"
                required
              />
            </div>
            <div>
              <label className="label">Description</label>
              <input
                className="input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this table is for"
              />
            </div>
            <div>
              <label className="label">
                Entries — one per line (2/4/5/10/20/25/50/100 lines for equal d100 bands)
              </label>
              <textarea
                className="input h-40 font-mono text-xs"
                value={form.entries}
                onChange={(e) => setForm({ ...form, entries: e.target.value })}
                placeholder={"Moonpetal\nIronbloom\nGhostmoss"}
                required
              />
            </div>
            <button className="btn-primary" disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : "Create table"}
            </button>
          </form>
        )}

        <ul className="mt-3 space-y-2">
          {custom.map((t) => (
            <li key={t.id} className="panel flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-semibold">
                  {t.name} <span className="tag ml-1">{(t.entries as string[]).length} entries</span>
                </p>
                {t.description && <p className="text-xs text-ink-500">{t.description}</p>}
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={busy} onClick={() => roll(t.id)}>
                  Roll d100
                </button>
                <button className="btn-ghost text-accent" onClick={() => removeTable(t.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {custom.length === 0 && (
            <li className="panel px-4 py-3 text-sm text-ink-500">
              No custom tables yet — author your own d100 tables above.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
