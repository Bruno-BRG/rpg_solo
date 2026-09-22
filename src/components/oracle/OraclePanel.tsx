"use client";
/**
 * Oracle panel — Mythic fate chart, random events, detail checks,
 * scene setup, interludes and NPC generation. Every query is
 * logged to the open scene.
 */
import { useState } from "react";
import { fateOdds } from "@/lib/oracle/fate-chart";

const LIKELIHOODS = [
  "Almost Impossible", "Very Unlikely", "Unlikely", "50/50",
  "Likely", "Very Likely", "Almost Certain",
] as const;

interface FateResult {
  answer?: string; roll?: number; threshold?: number; randomEvent?: boolean; odds?: number;
}
interface EventResult { description?: string; focus?: string; action?: string; subject?: string; }
interface DetailResult { kind?: string; word?: string; }
interface SetupResult { type?: string; description?: { description: string }; }
interface InterludeResult { question?: string; focus?: string; bennyAwarded?: boolean; }
interface NpcResult {
  npc?: { name: string; occupation: string; stance: string; appearance: string; personality: string; desire: string; secret: string; quirk: string };
  text?: string;
}
type RandomEvent = { description: string };

type OracleResult = FateResult | EventResult | DetailResult | SetupResult | InterludeResult | NpcResult;

export function OraclePanel({
  campaignId,
  openSceneId,
  chaosRank,
}: {
  campaignId: string;
  openSceneId: string | null;
  chaosRank: number;
}) {
  const [question, setQuestion] = useState("");
  const [likelihood, setLikelihood] = useState<(typeof LIKELIHOODS)[number]>("50/50");
  const [last, setLast] = useState<{ kind: string; result: OracleResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(kind: string, extra: Record<string, unknown> = {}) {
    if (!openSceneId) {
      setError("Start a scene first (Story tab → Begin the adventure).");
      return;
    }
    setError(null);
    setBusy(true);
    const res = await fetch("/api/oracle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneId: openSceneId, kind, question, likelihood, ...extra }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "The oracle is silent — try again.");
      return;
    }
    const data = await res.json();
    setLast({ kind, result: data.result });
  }

  const odds = fateOdds(likelihood, chaosRank);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {error && (
        <div className="border border-accent bg-accent/5 px-4 py-2 text-sm text-accent">{error}</div>
      )}

      <div className="panel">
        <div className="panel-header">Fate chart · chaos {chaosRank}</div>
        <div className="space-y-3 p-4">
          <input
            className="input"
            placeholder="Ask a yes/no question…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-48"
              value={likelihood}
              onChange={(e) => setLikelihood(e.target.value as (typeof LIKELIHOODS)[number])}
            >
              {LIKELIHOODS.map((l) => <option key={l}>{l}</option>)}
            </select>
            <button className="btn-primary" disabled={busy} onClick={() => ask("FateChart")}>
              Ask the Oracle
            </button>
            <span className="mono text-xs text-ink-500">{odds}% Yes</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <button className="btn-secondary h-16" disabled={busy} onClick={() => ask("RandomEvent")}>
          Random Event
        </button>
        <button className="btn-secondary h-16" disabled={busy} onClick={() => ask("DetailCheck", { detailKind: "Action" })}>
          Detail: Action
        </button>
        <button className="btn-secondary h-16" disabled={busy} onClick={() => ask("DetailCheck", { detailKind: "Subject" })}>
          Detail: Subject
        </button>
        <button className="btn-secondary h-16" disabled={busy} onClick={() => ask("Interlude", { context: question || undefined })}>
          Interlude
        </button>
        <button className="btn-secondary h-16" disabled={busy} onClick={() => ask("Npc")}>
          Generate NPC
        </button>
        <button className="btn-secondary h-16" disabled={busy} onClick={() => ask("SceneSetup")}>
          Set the Scene
        </button>
      </div>

      {last && (
        <div className="panel">
          <div className="panel-header">{last.kind}</div>
          <div className="p-4">
            <ResultView kind={last.kind} result={last.result} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Render the various oracle result shapes. */
function ResultView({ kind, result }: { kind: string; result: OracleResult }) {
  if (kind === "FateChart" && "answer" in result && result.answer) {
    const r = result as FateResult;
    return (
      <div className="text-center">
        <p className="font-serif text-3xl">
          {r.answer?.startsWith("Exceptional") && "★ "}
          {r.answer}
        </p>
        <p className="mono mt-2 text-ink-500">
          rolled {r.roll} vs {r.threshold}
          {typeof r.odds === "number" ? ` · odds were ${r.odds}%` : ""}
          {r.randomEvent && " · ⚡ random event triggered"}
        </p>
      </div>
    );
  }
  if (kind === "RandomEvent") {
    const r = result as EventResult;
    return (
      <div>
        <p className="font-serif text-lg">{r.description}</p>
        <p className="mt-1 text-xs text-ink-500">
          focus: {r.focus} · {r.action} / {r.subject}
        </p>
      </div>
    );
  }
  if (kind === "DetailCheck") {
    const r = result as DetailResult;
    return (
      <p className="font-serif text-lg">
        {r.kind}: <span className="font-semibold">{r.word}</span>
      </p>
    );
  }
  if (kind === "SceneSetup") {
    const r = result as SetupResult;
    return (
      <div>
        <p className="font-serif text-lg">{r.type} scene</p>
        {r.description && (
          <p className="mono mt-1 text-ink-500">{r.description.description}</p>
        )}
      </div>
    );
  }
  if (kind === "Interlude") {
    const r = result as InterludeResult;
    return (
      <div className="text-center">
        <p className="font-serif text-xl">{r.question}</p>
        <p className="mt-2 text-xs text-ink-500">
          focus: {r.focus} {r.bennyAwarded && "· +1 benny at the scene break"}
        </p>
      </div>
    );
  }
  if (kind === "Npc") {
    const npc = (result as NpcResult).npc;
    if (!npc) return <pre className="mono">{JSON.stringify(result, null, 2)}</pre>;
    return (
      <div className="space-y-2 text-sm">
        <p className="font-serif text-xl">
          {npc.name} <span className="tag ml-1">{npc.stance}</span>
        </p>
        <p className="text-ink-600">
          <span className="font-semibold">{npc.occupation}</span> — {npc.appearance}; {npc.personality}.
        </p>
        <p className="text-ink-600"><span className="font-semibold">Wants:</span> {npc.desire}</p>
        <p className="text-ink-600"><span className="font-semibold">Hides:</span> {npc.secret}</p>
        <p className="text-ink-600"><span className="font-semibold">Mannerism:</span> {npc.quirk}</p>
      </div>
    );
  }
  if (kind === "Table") {
    const r = result as { tableName?: string; roll?: number; text?: string };
    return (
      <div className="text-center">
        <p className="mono text-xs text-ink-400">{r.tableName} · rolled {r.roll}</p>
        <p className="mt-1 font-serif text-xl">{r.text}</p>
      </div>
    );
  }
  return <pre className="mono">{JSON.stringify(result, null, 2)}</pre>;
}
