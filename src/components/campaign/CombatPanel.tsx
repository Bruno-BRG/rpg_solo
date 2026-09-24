"use client";
/**
 * Combat panel — the tactical grid.
 *
 * The GM builds the board through tools; here the player can read it and
 * adjust: move pieces, fix wounds and conditions, paint or erase terrain,
 * add or remove combatants, and deal the next round of cards. Everything
 * is a small request to /api/campaigns/[id]/encounter.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cardScore,
  distanceSquares,
  rangeBand,
  reachableCells,
  cellKey,
  type ActionCard,
  type TerrainCell,
  type TerrainKind,
} from "@/lib/rules/combat";

interface Combatant {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  pace: number;
  parry: number;
  toughness: number;
  wounds: number;
  maxWounds: number;
  shaken: boolean;
  bennies: number;
  isExtra: boolean;
  defending: boolean;
  status: string;
  card: ActionCard | null;
  notes: string | null;
}

interface Encounter {
  id: string;
  name: string;
  round: number;
  width: number;
  height: number;
  status: string;
}

interface LogEntry { id: string; round: number; kind: string; text: string; }

const PAINT_MODES = ["off", "wall", "cover", "difficult", "hazard", "erase"] as const;
type PaintMode = (typeof PAINT_MODES)[number];

const TERRAIN_GLYPH: Record<TerrainKind, string> = {
  wall: "#",
  cover: "+",
  difficult: "~",
  hazard: "!",
};

export function CombatPanel({
  campaignId,
  refreshKey = 0,
}: {
  campaignId: string;
  refreshKey?: number;
}) {
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [combatants, setCombatants] = useState<Combatant[]>([]);
  const [terrain, setTerrain] = useState<TerrainCell[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [mode, setMode] = useState<PaintMode>("off");
  const [newName, setNewName] = useState("");
  const [newIsExtra, setNewIsExtra] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/campaigns/" + campaignId + "/encounter");
    if (res.ok) {
      const data = await res.json();
      setEncounter(data.encounter);
      setCombatants(data.combatants ?? []);
      setTerrain(data.encounter?.terrain ?? []);
      setLog(data.log ?? []);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  const selected = combatants.find((c) => c.id === selectedId) ?? null;
  const target = combatants.find((c) => c.id === targetId) ?? null;

  /** Squares the selected piece can reach with its Pace. */
  const reachable = useMemo(() => {
    if (!encounter || !selected || mode !== "off") return new Map<string, number>();
    const occupied = combatants
      .filter((c) => c.id !== selected.id)
      .map((c) => ({ x: c.x, y: c.y }));
    return reachableCells(
      { x: selected.x, y: selected.y },
      terrain,
      selected.pace,
      encounter.width,
      encounter.height,
      occupied,
    );
  }, [encounter, selected, combatants, terrain, mode]);

  async function post(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/campaigns/" + campaignId + "/encounter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "That did not work.");
    }
    await refresh();
  }

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/campaigns/" + campaignId + "/encounter", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "That did not work.");
    }
    await refresh();
  }

  async function remove(resource: string, itemId?: string) {
    const query = itemId ? "?resource=" + resource + "&itemId=" + itemId : "?resource=" + resource;
    await fetch("/api/campaigns/" + campaignId + "/encounter" + query, { method: "DELETE" });
    await refresh();
  }

  function handleCell(x: number, y: number) {
    const occupant = combatants.find((c) => c.x === x && c.y === y);
    if (mode !== "off") {
      if (mode === "erase") post({ resource: "terrain", cells: [{ x, y, kind: "wall" }], clear: true });
      else post({ resource: "terrain", cells: [{ x, y, kind: mode }] });
      return;
    }
    if (occupant) {
      if (selectedId && selectedId !== occupant.id && !targetId) setTargetId(occupant.id);
      else setSelectedId(occupant.id);
      return;
    }
    if (selected) patch({ resource: "combatants", id: selected.id, x, y });
  }

  if (loading) return <p className="p-6 text-sm text-ink-500">Loading…</p>;

  if (!encounter) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="panel p-6 text-center">
          <h2 className="font-serif text-lg">No fight on the grid</h2>
          <p className="mt-2 text-sm text-ink-500">
            The GM opens an encounter when a scene turns tactical. You can also
            start one here and place the pieces yourself.
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-center gap-2">
            <input
              className="input w-64"
              placeholder="Encounter name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={!newName.trim()}
              onClick={() => {
                post({ resource: "encounter", name: newName.trim() });
                setNewName("");
              }}
            >
              Open a 12x12 grid
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-accent">{error}</p>}
        </div>
      </div>
    );
  }

  const order = [...combatants]
    .filter((c) => c.card)
    .sort((a, b) => cardScore(b.card!) - cardScore(a.card!));

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-6 lg:grid-cols-4">
      <div className="space-y-3 lg:col-span-3">
        <div className="panel">
          <div className="panel-header flex flex-wrap items-center justify-between gap-2">
            <span>{encounter.name} · round {encounter.round}</span>
            <span className="flex flex-wrap items-center gap-1">
              {PAINT_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={
                    "h-6 border px-2 text-[11px] rounded-sm " +
                    (mode === m ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 hover:border-ink-500")
                  }
                >
                  {m}
                </button>
              ))}
            </span>
          </div>
          <div className="overflow-x-auto p-3">
            <div
              className="grid gap-[2px]"
              style={{ gridTemplateColumns: "repeat(" + encounter.width + ", 26px)" }}
            >
              {Array.from({ length: encounter.height }).map((_, y) =>
                Array.from({ length: encounter.width }).map((__, x) => {
                  const cell = terrain.find((t) => t.x === x && t.y === y);
                  const occupant = combatants.find((c) => c.x === x && c.y === y);
                  const isSelected = occupant && occupant.id === selectedId;
                  const isTarget = occupant && occupant.id === targetId;
                  const canReach = reachable.has(cellKey(x, y));
                  return (
                    <button
                      key={x + ":" + y}
                      title={
                        occupant
                          ? occupant.name + " (" + occupant.x + "," + occupant.y + ")"
                          : cell ? cell.kind : "open ground"
                      }
                      onClick={() => handleCell(x, y)}
                      className={
                        "flex h-[26px] w-[26px] items-center justify-center text-[11px] leading-none " +
                        (occupant
                          ? isTarget
                            ? "bg-accent text-white"
                            : isSelected
                              ? "bg-ink-900 text-white"
                              : occupant.isExtra ? "bg-ink-300" : "bg-ink-500 text-white"
                          : cell
                            ? cell.kind === "wall"
                              ? "bg-ink-700 text-white"
                              : cell.kind === "cover" ? "bg-ink-200" : "bg-ink-100 text-ink-600"
                            : canReach ? "bg-white ring-1 ring-ink-300" : "bg-white")
                      }
                    >
                      {occupant
                        ? occupant.name.slice(0, 1).toUpperCase() + (occupant.wounds > 0 ? "•" : "")
                        : cell ? TERRAIN_GLYPH[cell.kind as TerrainKind] : ""}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
          <p className="border-t border-ink-200 px-3 py-2 text-[11px] text-ink-500">
            Click a piece to select it, then click an empty square to move it — outlined squares are within
            its Pace. Pick a terrain mode to paint or erase. A dot next to the initial marks wounds.
          </p>
        </div>

        <div className="panel">
          <div className="panel-header">Action history</div>
          {log.length === 0 ? (
            <p className="p-3 text-sm text-ink-500">Nothing has happened yet.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-ink-100 overflow-y-auto">
              {[...log].reverse().map((entry) => (
                <li key={entry.id} className="flex gap-2 px-3 py-1.5 text-sm">
                  <span className="mono shrink-0 text-[10px] text-ink-400">R{entry.round}</span>
                  <span className="text-ink-600">{entry.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="panel">
          <div className="panel-header flex items-center justify-between">
            <span>Initiative</span>
            <button className="btn-ghost" onClick={() => patch({ resource: "encounter", dealRound: true })}>
              Next round
            </button>
          </div>
          {order.length === 0 ? (
            <p className="p-3 text-sm text-ink-500">No cards dealt yet.</p>
          ) : (
            <ol className="divide-y divide-ink-100">
              {order.map((c) => (
                <li
                  key={c.id}
                  className={
                    "flex items-center gap-2 px-3 py-1.5 text-sm " +
                    (c.id === selectedId ? "bg-ink-100" : "")
                  }
                >
                  <button
                    className={
                      "mono w-10 shrink-0 border px-1 text-center text-xs rounded-sm " +
                      (c.card && c.card.joker ? "border-accent text-accent" : "border-ink-300")
                    }
                    onClick={() => setSelectedId(c.id)}
                  >
                    {c.card ? c.card.label : "—"}
                  </button>
                  <span className="flex-1">{c.name}</span>
                  {c.card && c.card.joker && <span className="tag border-accent text-accent">+2 anytime</span>}
                  {c.shaken && <span className="tag">Shaken</span>}
                  {c.status !== "Active" && <span className="tag border-accent text-accent">{c.status}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">Selected piece</div>
          {!selected ? (
            <p className="p-3 text-sm text-ink-500">Select a piece on the grid.</p>
          ) : (
            <div className="space-y-2 p-3 text-sm">
              <p className="font-semibold">{selected.name}</p>
              <p className="text-xs text-ink-500">
                {selected.isExtra ? "Extra" : "Wild card"} · {selected.status}
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Stat label="Parry" value={selected.parry} />
                <Stat label="Toughness" value={selected.toughness} />
                <Stat label="Pace" value={selected.pace} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Counter
                  label="Wounds"
                  value={selected.wounds}
                  onChange={(v) => patch({ resource: "combatants", id: selected.id, wounds: Math.max(0, v) })}
                />
                <Counter
                  label="Bennies"
                  value={selected.bennies}
                  onChange={(v) => patch({ resource: "combatants", id: selected.id, bennies: Math.max(0, v) })}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  className={"btn-ghost " + (selected.shaken ? "text-accent" : "")}
                  onClick={() => patch({ resource: "combatants", id: selected.id, shaken: !selected.shaken })}
                >
                  {selected.shaken ? "Shaken" : "Not shaken"}
                </button>
                <button
                  className={"btn-ghost " + (selected.defending ? "text-accent" : "")}
                  onClick={() => patch({ resource: "combatants", id: selected.id, defending: !selected.defending })}
                >
                  {selected.defending ? "Defending (+2 Parry)" : "Not defending"}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => patch({
                    resource: "combatants",
                    id: selected.id,
                    status: selected.status === "Active" ? "Down" : "Active",
                  })}
                >
                  {selected.status === "Active" ? "Take down" : "Back up"}
                </button>
              </div>
              {target && (
                <p className="border-t border-ink-200 pt-2 text-xs text-ink-600">
                  {distanceSquares(selected, target)} squares to {target.name} · range
                  {" "}
                  {rangeBand(distanceSquares(selected, target)).band}
                  {" "}
                  ({rangeBand(distanceSquares(selected, target)).penalty})
                </p>
              )}
              <div className="flex gap-1">
                <button className="btn-ghost" onClick={() => setTargetId(selected.id === targetId ? null : targetId)}>
                  {targetId ? "Clear target" : "Set target"}
                </button>
                <button className="btn-ghost text-accent" onClick={() => remove("combatants", selected.id)}>
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">Add a piece</div>
          <div className="space-y-2 p-3">
            <input
              className="input"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newIsExtra} onChange={(e) => setNewIsExtra(e.target.checked)} />
              Extra (taken out by one wound)
            </label>
            <button
              className="btn-secondary"
              disabled={!newName.trim()}
              onClick={() => {
                post({
                  resource: "combatants",
                  name: newName.trim(),
                  isExtra: newIsExtra,
                  kind: newIsExtra ? "Extra" : "StoryCharacter",
                  x: 0,
                  y: 0,
                });
                setNewName("");
              }}
            >
              Place at (0,0)
            </button>
            <button className="btn-ghost text-accent" onClick={() => remove("encounter")}>
              End the encounter
            </button>
            {error && <p className="text-xs text-accent">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-ink-400">{label}</span>
      <span className="mono">{value}</span>
    </span>
  );
}

function Counter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-ink-400">{label}</span>
      <button className="btn-ghost h-6 w-6 px-0" onClick={() => onChange(value - 1)}>−</button>
      <span className="mono w-6 text-center">{value}</span>
      <button className="btn-ghost h-6 w-6 px-0" onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}
