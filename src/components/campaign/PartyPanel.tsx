"use client";
/**
 * Party panel — Savage Worlds character sheets of the campaign.
 *
 * Shows derived stats (Pace/Parry/Toughness), current condition,
 * XP/advance progress and quick controls for the knobs the table
 * touches most (bennies, wounds, XP awards).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { deriveStats } from "@/lib/rules/derived";
import { progress } from "@/lib/rules/progression";
import { stepNotation } from "@/lib/rules/ranks";

interface Sheet {
  id: string;
  name: string;
  rank: string;
  xp: number;
  bennies: number;
  wounds: number;
  fatigue: number;
  shaken: boolean;
  powerPoints: number;
  isDead: boolean;
  agility: number;
  smarts: number;
  spirit: number;
  strength: number;
  vigor: number;
  skills: unknown;
  gear?: string | null;
}

export function PartyPanel({ campaignId }: { campaignId: string }) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/characters`);
    if (res.ok) {
      const data = await res.json();
      setSheets(data.characters);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function patch(id: string, body: Record<string, unknown>) {
    setSheets((s) =>
      s.map((c) => (c.id === id ? ({ ...c, ...body } as Sheet) : c)),
    );
    await fetch(`/api/campaigns/${campaignId}/characters`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
  }

  if (loading) return <p className="p-6 text-sm text-ink-500">Loading…</p>;

  if (sheets.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="panel p-6 text-center">
          <p className="text-sm text-ink-500">
            No characters in this campaign yet.
          </p>
          <Link href="/characters" className="btn-primary mt-4 inline-flex">
            Create a character
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      {sheets.map((c) => {
        const skills = (c.skills ?? {}) as Record<string, number>;
        const derived = deriveStats({
          vigor: c.vigor,
          smarts: c.smarts,
          strength: c.strength,
          rank: c.rank,
          skills,
        });
        const snap = progress(c.xp);
        return (
          <li key={c.id} className="panel list-none px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{c.name}</span>
                <span className="tag">{c.rank}</span>
                {c.isDead && <span className="tag border-accent text-accent">Dead</span>}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="mono text-xs text-ink-500">
                  {snap.xp} XP · {snap.advances} adv
                  {snap.advancesToNextRank !== null &&
                    ` · ${snap.advancesToNextRank} to ${nextRank(c.rank)}`}
                </span>
                <button className="btn-ghost" onClick={() => patch(c.id, { xp: c.xp + 1 })}>
                  +1 XP
                </button>
                <button className="btn-ghost" onClick={() => patch(c.id, { xp: c.xp + 5 })}>
                  +5 XP
                </button>
              </div>
            </div>

            {/* Advance progress toward next rank */}
            <div className="mt-2 h-1 w-full bg-ink-100">
              <div
                className="h-1 bg-accent"
                style={{ width: `${snap.advancesToNextRank === null ? 100 : Math.min(100, (snap.advances % 4) * 25)}%` }}
              />
            </div>

            {/* Derived + condition */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600">
              <span className="mono">Pace {derived.pace}</span>
              <span className="mono">Parry {derived.parry}</span>
              <span className="mono">Toughness {derived.toughness}</span>
              <span className="mono">
                Vig {stepNotation(c.vigor)} · Agi {stepNotation(c.agility)} ·
                Sm {stepNotation(c.smarts)} · Spr {stepNotation(c.spirit)} ·
                Str {stepNotation(c.strength)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <Counter
                label="Bennies"
                value={c.bennies}
                onChange={(v) => patch(c.id, { bennies: Math.max(0, Math.min(10, v)) })}
              />
              <Counter
                label="Wounds"
                value={c.wounds}
                danger
                onChange={(v) => patch(c.id, { wounds: Math.max(0, Math.min(5, v)) })}
              />
              <Counter
                label="Fatigue"
                value={c.fatigue}
                danger
                onChange={(v) => patch(c.id, { fatigue: Math.max(0, Math.min(3, v)) })}
              />
              <button
                className={`tag ${c.shaken ? "border-accent text-accent" : ""}`}
                aria-pressed={c.shaken}
                onClick={() => patch(c.id, { shaken: !c.shaken })}
              >
                {c.shaken ? "Shaken" : "Not shaken"}
              </button>
            </div>
          </li>
        );
      })}
    </div>
  );
}

function nextRank(rank: string): string {
  const order = ["Novice", "Seasoned", "Veteran", "Heroic", "Legendary"];
  const i = order.indexOf(rank);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : "—";
}

function Counter({
  label,
  value,
  onChange,
  danger,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  danger?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className={`text-xs uppercase tracking-wider ${danger ? "text-accent" : "text-ink-500"}`}>
        {label}
      </span>
      <button className="btn-ghost h-6 w-6 px-0" onClick={() => onChange(value - 1)}>−</button>
      <span className="mono w-5 text-center font-semibold">{value}</span>
      <button className="btn-ghost h-6 w-6 px-0" onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}
