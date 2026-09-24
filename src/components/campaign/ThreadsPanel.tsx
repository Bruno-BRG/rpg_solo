"use client";
/**
 * Threads & cast panel — Mythic thread tracking and the story's
 * non-player characters. Also where scenes are opened.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Thread { id: string; summary: string; status: string; tension: number; }
interface Cast { id: string; name: string; description: string | null; stance: string; status: string; }
interface Scene { id: string; title: string; type: string; open: boolean; }
interface Task {
  id: string;
  name: string;
  skills: string[];
  successes: number;
  requiredSuccesses: number;
  timeLimit: number;
  timeUsed: number;
  status: string;
}

export function ThreadsPanel({
  campaignId,
  refreshKey = 0,
}: {
  campaignId: string;
  refreshKey?: number;
}) {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [cast, setCast] = useState<Cast[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
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
      setTasks(data.campaign.tasks ?? []);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [campaignId, refreshKey]);

  async function post(body: object) {
    await fetch(`/api/campaigns/${campaignId}/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await refresh();
    router.refresh();
  }

  async function remove(resource: string, itemId: string) {
    await fetch(`/api/campaigns/${campaignId}/story?resource=${resource}&itemId=${itemId}`, {
      method: "DELETE",
    });
    await refresh();
    if (resource === "scenes") router.refresh();
  }

  async function closeScene(id: string) {
    await fetch(`/api/campaigns/${campaignId}/story`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "scenes", id }),
    });
    await refresh();
    router.refresh();
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
              <div className="flex items-center gap-2">
                {s.open && <button className="btn-ghost" onClick={() => closeScene(s.id)}>Close</button>}
                <button aria-label={`Delete ${s.title}`} className="text-ink-400 hover:text-accent" onClick={() => remove("scenes", s.id)}>×</button>
              </div>
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

      {/* Dramatic tasks */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-500">
          Dramatic tasks
        </h2>
        <ul className="space-y-2">
          {tasks.map((t) => {
            const percent = Math.min(100, Math.round((t.successes / t.requiredSuccesses) * 100));
            return (
              <li key={t.id} className="panel px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`tag ${
                        t.status === "completed"
                          ? "border-green-700 text-green-700"
                          : t.status === "failed"
                            ? "border-accent text-accent"
                            : ""
                      }`}
                    >
                      {t.status}
                    </span>
                    <button className="text-ink-400 hover:text-accent" onClick={() => remove("tasks", t.id)}>×</button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 bg-ink-100">
                    <div
                      className={`h-1.5 ${t.status === "failed" ? "bg-accent" : "bg-ink-700"}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="mono text-xs text-ink-500">
                    {t.successes}/{t.requiredSuccesses} · round {t.timeUsed}/{t.timeLimit}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-400">skills: {t.skills.join(", ")}</p>
              </li>
            );
          })}
          {tasks.length === 0 && (
            <li className="text-sm text-ink-500">
              No dramatic tasks. The GM starts one when the clock matters.
            </li>
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
