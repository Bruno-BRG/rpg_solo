/**
 * Savage Worlds progression: experience, advances and ranks.
 *
 * SWADE awards Experience Points; every 5 XP buys an "advance"
 * (raise a skill/attribute or take an Edge). Ranks unlock at
 * fixed advance counts.
 *
 * Pure functions over a character's current XP.
 */
import { rankFromAdvances, type Rank } from "./ranks";

/** XP needed per advance (SWADE: one advance every 5 XP). */
export const XP_PER_ADVANCE = 5;

export interface ProgressSnapshot {
  xp: number;
  /** Advances already earned (floor of xp / 5). */
  advances: number;
  /** XP still needed for the next advance. */
  xpToNextAdvance: number;
  /** 0–1 progress toward the next advance. */
  advanceProgress: number;
  /** Current rank derived from advances. */
  rank: Rank;
  /** Advances needed for the next rank (null at Legendary). */
  advancesToNextRank: number | null;
}

/** Award XP (never below zero). */
export function awardXp(currentXp: number, amount = 1): number {
  return Math.max(0, currentXp + amount);
}

/** Snapshot of a character's progression. */
export function progress(xp: number): ProgressSnapshot {
  const safeXp = Math.max(0, xp);
  const advances = Math.floor(safeXp / XP_PER_ADVANCE);
  const xpToNextAdvance = safeXp % XP_PER_ADVANCE;
  const rank = rankFromAdvances(advances);

  // Next rank threshold: Seasoned 4, Veteran 8, Heroic 12,
  // Legendary 16 advances (see ranks.ts).
  const thresholds = [4, 8, 12, 16];
  const next = thresholds.find((t) => t > advances) ?? null;

  return {
    xp: safeXp,
    advances,
    xpToNextAdvance,
    advanceProgress: xpToNextAdvance / XP_PER_ADVANCE,
    rank,
    advancesToNextRank: next === null ? null : next - advances,
  };
}

/**
 * Simplified rank check: can this XP total buy the next rank-up?
 * (Rank-ups in play are gated by the GM approving the Edge/raise
 * that spends the advances.)
 */
export function rankUpAvailable(xp: number): { rank: Rank; ready: boolean } {
  const snap = progress(xp);
  return {
    rank: snap.rank,
    ready: snap.advancesToNextRank === 0,
  };
}
