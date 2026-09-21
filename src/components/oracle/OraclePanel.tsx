"use client";
/**
 * Oracle panel — Mythic fate chart, random events, detail checks
 * and scene setup. Every query is logged to the open scene.
 */
import { useState } from "react";

const LIKELIHOODS = [
  "Almost Impossible", "Very Unlikely", "Unlikely", "50/50",
  "Likely", "Very Likely", "Almost Certain",
] as const;

interface FateResult {
  answer?: string; roll?: number; threshold?: number; randomEvent?: boolean;
}
interface EventResult { description?: string; focus?: string; action?: string; subject?: string; }
interface DetailResult { kind?: string; word?: string; }
interface SetupResult { type?: string; description?: RandomEvent; }
type RandomEvent = { description: string };

type OracleResult = FateResult | EventResult | DetailResult | SetupResult;

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

  async function ask(kind: string, extra: Record<string, unknown> = {}) {
    if (!openSceneId) {
      alert("Start a scene first (Threads & Cast tab).");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/oracle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneId: openSceneId, kind, question, likelihood, ...extra }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setLast({ kind, result: data.result });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
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
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button className="btn-secondary h-16" disabled={busy} onClick={() => ask("RandomEvent")}>
          Random Event
        </button>
        <button className="btn-secondary h-16" disabled={busy} onClick={() => ask("DetailCheck", { detailKind: "Action" })}>
          Detail: Action
        </button>
        <button className="btn-secondary h-16" disabled={busy} onClick={() => ask("DetailCheck", { detailKind: "Subject" })}>
          Detail: Subject
        </button>
      </div>

      <button className="btn-secondary w-full h-12" disabled={busy} onClick={() => ask("SceneSetup")}>
        Set the Scene
      </button>

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
          {r.randomEvent && " · ⚡ random event triggered"}
        </p>
      </div>
    );
  }
  if (kind === "RandomEvent") {
    const r = result as EventResult;
    return <p className="font-serif text-lg">{r.description}</p>;
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
  return <pre className="mono">{JSON.stringify(result, null, 2)}</pre>;
}
