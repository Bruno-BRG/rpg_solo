"use client";
/**
 * Threads & cast panel — Mythic thread tracking and the story's
 * non-player characters. Also where scenes are opened.
 */
import { useEffect, useState } from "react";

interface Thread { id: string; summary: string; status: string; tension: number; }
interface Cast { id: string; name: string; description: string | null; stance: string; status: string; }
interface Scene { id: string; title: string; type: string; open: boolean; }

export function ThreadsPanel({ campaignId }: { campaignId: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [cast, setCast] = useState<Cast[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [threadText, setThreadText] = useState("");
  const [castForm, setCastForm] = useState({ name: "", description: "", stance: "Neutral" });
  const [sceneTitle, setSceneTitle] = useState("");

  async function refresh() {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    if (res.ok) {
      const data = await res.json();
      setThreads(data.campaign.threads);
      setCast(data.campaign.storyChars);
      setScenes(data.campaign.scenes);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [campaignId]);

  async function post(body: object) {
    await fetch(`/api/campaigns/${campaignId}/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await refresh();
  }

  async function remove(resource: string, itemId: string) {
    await fetch(`/api/campaigns/${campaignId}/story?resource=${resource}&itemId=${itemId}`, {
      method: "DELETE",
    });
    await refresh();
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 p-6 lg:grid-cols-3">
      {/* Scenes */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-500">Scenes</h2>
        <div className="mb-3 flex gap-2">
          <input className="input" placeholder="New scene title…" value={sceneTitle}
            onChange={(e) => setSceneTitle(e.target.value)} />
          <button className="btn-secondary" disabled={!sceneTitle.trim()}
            onClick={() => { post({ resource: "scenes", title: sceneTitle }); setSceneTitle(""); }}>
            Open
          </button>
        </div>
        <ul className="space-y-2">
          {scenes.map((s) => (
            <li key={s.id} className="panel flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {s.title} <span className="tag ml-1">{s.type}</span>
                {!s.open && <span className="ml-1 text-ink-400">(closed)</span>}
              </span>
              <button className="text-ink-400 hover:text-accent" onClick={() => remove("scenes", s.id)}>×</button>
            </li>
          ))}
          {scenes.length === 0 && <p className="text-sm text-ink-500">No scenes yet.</p>}
        </ul>
      </section>

      {/* Threads */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-500">Plot threads</h2>
        <div className="mb-3 flex gap-2">
          <input className="input" placeholder="New thread…" value={threadText}
            onChange={(e) => setThreadText(e.target.value)} />
          <button className="btn-secondary" disabled={!threadText.trim()}
            onClick={() => { post({ resource: "threads", summary: threadText }); setThreadText(""); }}>
            Add
          </button>
        </div>
        <ul className="space-y-2">
          {threads.filter((t) => t.status === "Active").map((t) => (
            <li key={t.id} className="panel flex items-center justify-between px-3 py-2 text-sm">
              <span>{t.summary}</span>
              <button className="text-ink-400 hover:text-accent" onClick={() => remove("threads", t.id)}>×</button>
            </li>
          ))}
          {threads.filter((t) => t.status === "Active").length === 0 && (
            <p className="text-sm text-ink-500">No active threads.</p>
          )}
        </ul>
      </section>

      {/* Cast */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-500">Cast</h2>
        <div className="panel mb-3 space-y-2 p-3">
          <input className="input" placeholder="Name" value={castForm.name}
            onChange={(e) => setCastForm({ ...castForm, name: e.target.value })} />
          <input className="input" placeholder="Description" value={castForm.description}
            onChange={(e) => setCastForm({ ...castForm, description: e.target.value })} />
          <div className="flex gap-2">
            <select className="input" value={castForm.stance}
              onChange={(e) => setCastForm({ ...castForm, stance: e.target.value })}>
              <option>Neutral</option><option>Friendly</option><option>Hostile</option>
            </select>
            <button className="btn-secondary" disabled={!castForm.name.trim()}
              onClick={() => { post({ resource: "cast", ...castForm }); setCastForm({ name: "", description: "", stance: "Neutral" }); }}>
              Add
            </button>
          </div>
        </div>
        <ul className="space-y-2">
          {cast.filter((c) => c.status === "Alive").map((c) => (
            <li key={c.id} className="panel px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{c.name}</span>
                <div className="flex items-center gap-2">
                  <span className="tag">{c.stance}</span>
                  <button className="text-ink-400 hover:text-accent" onClick={() => remove("cast", c.id)}>×</button>
                </div>
              </div>
              {c.description && <p className="mt-1 text-ink-500">{c.description}</p>}
            </li>
          ))}
          {cast.filter((c) => c.status === "Alive").length === 0 && (
            <p className="text-sm text-ink-500">Cast is empty.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
