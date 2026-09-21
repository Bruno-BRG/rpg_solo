/**
 * Savage Worlds derived stats and condition formulas.
 *
 * Pure functions over a character's sheet — no IO. Used by the
 * character creator, the sheet UI and the AI GM tool layer.
 */

import { rankIndex } from "./ranks";

/** Subset of the character sheet needed for derived stats. */
export interface StatBlock {
  vigor: number;
  smarts: number;
  strength: number;
  rank: string;
  skills: Record<string, number>;
}

/** Derived statistics computed from a stat block. */
export interface DerivedStats {
  /** Pace: base 6, +1 per d6+ in Strength-linked situations. */
  pace: number;
  /** Parry: 2 + half Fighting die (rounded down). */
  parry: number;
  /** Toughness: half Vigor + 2. */
  toughness: number;
  /** Maximum wounds: 3 (+1 with Size/edge adjustments handled elsewhere). */
  maxWounds: number;
  /** Maximum fatigue levels: 2. */
  maxFatigue: number;
  /** Load limit: Strength step × 5 lbs (simplified SWADE formula). */
  loadLimit: number;
}

/** Half a die step rounded down (e.g. d8 → 4). */
function halfStep(step: number): number {
  return Math.floor(step / 2);
}

/** Compute all derived stats for a character. */
export function deriveStats(stats: StatBlock): DerivedStats {
  const fighting = stats.skills["Fighting"] ?? 0;
  return {
    pace: 6,
    parry: 2 + halfStep(fighting),
    toughness: halfStep(stats.vigor) + 2,
    maxWounds: 3,
    maxFatigue: 2,
    loadLimit: dieSidesToLoad(stats.strength),
  };
}

/** Load limit from Strength step: d4=5 … d12=60 (step × 5). */
function dieSidesToLoad(strength: number): number {
  const sides = strength === 3 ? 4 : strength;
  return sides * 5;
}

/** Wounds incurred check: is the character incapacitated? */
export function isIncapacitated(wounds: number, maxWounds = 3): boolean {
  return wounds > maxWounds;
}

/** Ranks at which a character gains an advance (informational). */
export function advancesPerRank(rank: string): number {
  return rankIndex(rank) * 4;
}
