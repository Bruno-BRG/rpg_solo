"use client";
/**
 * Prep panel — the GM's forward plan.
 *
 * Hidden behind a reveal button because it is full of spoilers: arcs the
 * GM is steering toward, events it is preparing, pressure clocks and the
 * agendas driving each NPC. Revealing it is a player choice, and the plan
 * stays a guide the fiction can overturn.
 */
import { useCallback, useEffect, useState } from "react";

interface Arc {
  id: string;
  name: string;
  premise: string | null;
  goal: string | null;
  status: string;
}
interface Beat {
  id: string;
  title: string;
  detail: string | null;
  arcId: string | null;
  status: string;
}
interface Clock {
  id: string;
  name: string;
  description: string | null;
  current: number;
  max: number;
  status: string;
}
interface Cast {
  id: string;
  name: string;
  stance: string;
  agenda: string | null;
  plan: string | null;
}

const ARC_STATUSES = ["Planned", "Active", "Resolved", "Abandoned"];
const BEAT_STATUSES = ["Planned", "Ready", "Done", "Skipped"];

export function PrepPanel({
  campaignId,
  refreshKey = 0,
}: {
  campaignId: string;
  refreshKey?: number;
}) {
  const [revealed, setRevealed] = useState(false);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [clocks, setClocks] = useState<Clock[]>([]);
  const [cast, setCast] = useState<Cast[]>([]);
  const [loading, setLoading] = useState(true);
  const [arcForm, setArcForm] = useState({ name: "", goal: "" });
  const [beatForm, setBeatForm] = useState({ title: "", arcId: "" });
  const [clockForm, setClockForm] = useState({ name: "", max: 6 });

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    if (res.ok) {
      const data = await res.json();
      setArcs(data.campaign.arcs ?? []);
      setBeats(data.campaign.beats ?? []);
      setClocks(data.campaign.clocks ?? []);
      setCast(data.campaign.storyChars ?? []);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  async function create(body: Record<string, unknown>) {
    await fetch(`/api/campaigns/${campaignId}/story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await refresh();
  }

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/campaigns/${campaignId}/story`, {
      method: "PATCH",
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

  if (loading) return <p className="p-6 text-sm text-ink-500">Loading…</p>;

  if (!revealed) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="panel p-6 text-center">
          <h2 className="font-serif text-lg">The GM&apos;s prep</h2>
          <p className="mt-2 text-sm text-ink-500">
            Arcs, upcoming events, tension clocks and NPC agendas the GM is
            playing toward. Opening this reveals where the story is heading.
          </p>
          <button className="btn-secondary mt-4" onClick={() => setRevealed(true)}>
            Reveal prep
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          The GM&apos;s plan is a guide, not a script — the oracle and your choices can rewrite it.
        </p>
        <button className="btn-ghost" onClick={() => setRevealed(false)}>Hide</button>
      </div>

      {/* Arcs */}
      <section>
        <h2 className="font-serif text-lg">Arcs</h2>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!arcForm.name.trim()) return;
            create({ resource: "arcs", name: arcForm.name.trim(), goal: arcForm.goal.trim() || undefined });
            setArcForm({ name: "", goal: "" });
          }}
        >
          <input
            className="input min-w-48 flex-1"
            placeholder="Arc name"
            value={arcForm.name}
            onChange={(e) => setArcForm({ ...arcForm, name: e.target.value })}
          />
          <input
            className="input min-w-48 flex-1"
            placeholder="Goal (optional)"
            value={arcForm.goal}
            onChange={(e) => setArcForm({ ...arcForm, goal: e.target.value })}
          />
          <button className="btn-primary" disabled={!arcForm.name.trim()}>Add arc</button>
        </form>
        <ul className="mt-3 space-y-2">
          {arcs.map((arc) => (
            <li key={arc.id} className="panel px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{arc.name}</span>
                <select
                  className="input ml-auto w-32"
                  value={arc.status}
                  onChange={(e) => patch({ resource: "arcs", id: arc.id, status: e.target.value })}
                >
                  {ARC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="text-ink-400 hover:text-accent" onClick={() => remove("arcs", arc.id)}>×</button>
              </div>
              {arc.goal && <p className="mt-1 text-ink-500">Goal: {arc.goal}</p>}
              {arc.premise && <p className="mt-1 text-ink-500">{arc.premise}</p>}
            </li>
          ))}
          {arcs.length === 0 && <li className="panel px-3 py-2 text-sm text-ink-500">No arcs yet.</li>}
        </ul>
      </section>

      {/* Upcoming events */}
      <section>
        <h2 className="font-serif text-lg">Upcoming events</h2>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!beatForm.title.trim()) return;
            create({
              resource: "beats",
              title: beatForm.title.trim(),
              arcId: beatForm.arcId || undefined,
            });
            setBeatForm({ title: "", arcId: "" });
          }}
        >
          <input
            className="input min-w-48 flex-1"
            placeholder="What the GM is preparing"
            value={beatForm.title}
            onChange={(e) => setBeatForm({ ...beatForm, title: e.target.value })}
          />
          <select
            className="input w-40"
            value={beatForm.arcId}
            onChange={(e) => setBeatForm({ ...beatForm, arcId: e.target.value })}
          >
            <option value="">No arc</option>
            {arcs.map((arc) => <option key={arc.id} value={arc.id}>{arc.name}</option>)}
          </select>
          <button className="btn-primary" disabled={!beatForm.title.trim()}>Add event</button>
        </form>
        <ul className="mt-3 space-y-2">
          {beats.map((beat) => (
            <li key={beat.id} className="panel px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="flex-1">{beat.title}</span>
                {beat.arcId && (
                  <span className="tag">{arcs.find((a) => a.id === beat.arcId)?.name ?? "arc"}</span>
                )}
                <select
                  className="input w-28"
                  value={beat.status}
                  onChange={(e) => patch({ resource: "beats", id: beat.id, status: e.target.value })}
                >
                  {BEAT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="text-ink-400 hover:text-accent" onClick={() => remove("beats", beat.id)}>×</button>
              </div>
              {beat.detail && <p className="mt-1 text-ink-500">{beat.detail}</p>}
            </li>
          ))}
          {beats.length === 0 && (
            <li className="panel px-3 py-2 text-sm text-ink-500">Nothing prepared yet.</li>
          )}
        </ul>
      </section>

      {/* Tension clocks */}
      <section>
        <h2 className="font-serif text-lg">Tension clocks</h2>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!clockForm.name.trim()) return;
            create({ resource: "clocks", name: clockForm.name.trim(), max: clockForm.max });
            setClockForm({ name: "", max: 6 });
          }}
        >
          <input
            className="input min-w-48 flex-1"
            placeholder="Pressure that builds (e.g. The ritual completes)"
            value={clockForm.name}
            onChange={(e) => setClockForm({ ...clockForm, name: e.target.value })}
          />
          <select
            className="input w-24"
            value={clockForm.max}
            onChange={(e) => setClockForm({ ...clockForm, max: Number(e.target.value) })}
          >
            {[4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} steps</option>)}
          </select>
          <button className="btn-primary" disabled={!clockForm.name.trim()}>Add clock</button>
        </form>
        <ul className="mt-3 space-y-2">
          {clocks.map((clock) => (
            <li key={clock.id} className="panel px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="flex-1">{clock.name}</span>
                <span className="mono text-xs text-ink-500">{clock.current}/{clock.max}</span>
                <button
                  className="btn-ghost h-6 w-6 px-0"
                  onClick={() => patch({ resource: "clocks", id: clock.id, current: Math.max(0, clock.current - 1) })}
                >
                  −
                </button>
                <button
                  className="btn-ghost h-6 w-6 px-0"
                  onClick={() => patch({ resource: "clocks", id: clock.id, current: Math.min(clock.max, clock.current + 1) })}
                >
                  +
                </button>
                <button className="text-ink-400 hover:text-accent" onClick={() => remove("clocks", clock.id)}>×</button>
              </div>
              <div className="mt-2 h-1 w-full bg-ink-100">
                <div
                  className="h-1 bg-accent"
                  style={{ width: `${Math.min(100, (clock.current / clock.max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
          {clocks.length === 0 && (
            <li className="panel px-3 py-2 text-sm text-ink-500">No clocks running.</li>
          )}
        </ul>
      </section>

      {/* NPC agendas */}
      <section>
        <h2 className="font-serif text-lg">NPC agendas</h2>
        <p className="mt-1 text-sm text-ink-500">What each character wants, and what they are doing about it.</p>
        <ul className="mt-3 space-y-2">
          {cast.map((member) => (
            <AgendaRow key={member.id} member={member} onSave={patch} />
          ))}
          {cast.length === 0 && (
            <li className="panel px-3 py-2 text-sm text-ink-500">
              No story characters yet. The GM adds them as they appear.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function AgendaRow({
  member,
  onSave,
}: {
  member: Cast;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [agenda, setAgenda] = useState(member.agenda ?? "");
  const [plan, setPlan] = useState(member.plan ?? "");
  const dirty = agenda !== (member.agenda ?? "") || plan !== (member.plan ?? "");

  return (
    <li className="panel px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{member.name}</span>
        <span className="tag">{member.stance}</span>
        {dirty && (
          <button
            className="btn-ghost ml-auto"
            onClick={() => onSave({ resource: "agendas", id: member.id, agenda, plan })}
          >
            Save
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          className="input"
          placeholder="Wants…"
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
        />
        <input
          className="input"
          placeholder="Doing about it…"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
        />
      </div>
    </li>
  );
}
