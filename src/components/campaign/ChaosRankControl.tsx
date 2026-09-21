"use client";
/**
 * Chaos rank control — Mythic chaos rank 1–9 with plain stepper.
 */
import { Minus, Plus } from "lucide-react";

export function ChaosRankControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (rank: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-500">
        Chaos
      </span>
      <div className="flex items-center border border-ink-300 rounded-sm">
        <button
          className="px-2 py-1 hover:bg-ink-100 disabled:opacity-30"
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={value <= 1}
          aria-label="Decrease chaos"
        >
          <Minus size={12} />
        </button>
        <span className="mono w-8 text-center">{value}</span>
        <button
          className="px-2 py-1 hover:bg-ink-100 disabled:opacity-30"
          onClick={() => onChange(Math.min(9, value + 1))}
          disabled={value >= 9}
          aria-label="Increase chaos"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
