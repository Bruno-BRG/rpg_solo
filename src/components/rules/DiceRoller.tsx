"use client";
/**
 * Global dice roller — trait rolls (wild die, acing) and plain
 * dice. Uses the /api/dice endpoint so rolls are auditable.
 */
import { useState } from "react";

interface TraitResult {
  label: string; traitRolls: number[]; wildRolls: number[]; total: number;
  usedDie: string; success: boolean; raises: number; criticalFailure: boolean;
}
interface PlainResult { rolls: number[]; total: number; sides: number; }

const STEPS = [
  { value: 3, label: "d4-1" },
  { value: 4, label: "d4" },
  { value: 6, label: "d6" },
  { value: 8, label: "d8" },
  { value: 10, label: "d10" },
  { value: 12, label: "d12" },
];

export function DiceRoller() {
  const [step, setStep] = useState(6);
  const [target, setTarget] = useState(4);
  const [modifier, setModifier] = useState(0);
  const [trait, setTrait] = useState<TraitResult | null>(null);
  const [plain, setPlain] = useState<PlainResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function roll(mode: "trait" | "plain", extra: object = {}) {
    setBusy(true);
    const res = await fetch("/api/dice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "trait"
          ? { mode, dieStep: step, targetNumber: target, modifier }
          : { mode, ...extra },
      ),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      if (data.mode === "trait") setTrait(data.result);
      else setPlain(data.result);
    }
  }

  return (
    <div className="space-y-6">
      {/* Trait roll */}
      <div className="panel">
        <div className="panel-header">Trait roll · wild die</div>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="label">Die</label>
            <select className="input w-24" value={step} onChange={(e) => setStep(Number(e.target.value))}>
              {STEPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Target</label>
            <input type="number" className="input w-20" value={target}
              onChange={(e) => setTarget(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Modifier</label>
            <input type="number" className="input w-20" value={modifier}
              onChange={(e) => setModifier(Number(e.target.value))} />
          </div>
          <button className="btn-primary" disabled={busy} onClick={() => roll("trait")}>
            Roll trait
          </button>
        </div>
        {trait && (
          <div className="border-t border-ink-200 p-4">
            <p className="font-serif text-2xl">
              {trait.criticalFailure && <span className="text-accent">Critical Failure! </span>}
              {!trait.criticalFailure && (trait.success ? "Success" : "Failure")}
              {trait.success && trait.raises > 0 && ` with ${trait.raises} raise${trait.raises > 1 ? "s" : ""}`}
            </p>
            <p className="mono mt-1 text-ink-500">
              trait {trait.traitRolls.join("+")} / wild {trait.wildRolls.join("+")} → total {trait.total}
              <span className="ml-2">({trait.usedDie} die used)</span>
            </p>
          </div>
        )}
      </div>

      {/* Plain dice */}
      <div className="panel">
        <div className="panel-header">Plain dice · damage, tracking</div>
        <div className="flex flex-wrap gap-2 p-4">
          {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
            <button key={sides} className="btn-secondary mono" disabled={busy}
              onClick={() => roll("plain", { sides, count: 1 })}>
              d{sides}
            </button>
          ))}
          <button className="btn-secondary mono" disabled={busy}
            onClick={() => roll("plain", { sides: 6, count: 2 })}>
            2d6
          </button>
        </div>
        {plain && (
          <div className="border-t border-ink-200 p-4">
            <p className="font-serif text-2xl">{plain.total}</p>
            <p className="mono mt-1 text-ink-500">
              d{plain.sides}: {plain.rolls.join(", ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
