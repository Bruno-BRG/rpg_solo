/**
 * Savage Worlds rank and progression rules.
 *
 * Characters rank up with advances. Skill limits, attribute
 * limits and starting stats depend on the current rank.
 */

/** The five Savage Worlds ranks. */
export const RANKS = ["Novice", "Seasoned", "Veteran", "Heroic", "Legendary"] as const;
export type Rank = (typeof RANKS)[number];

/** Attribute names — universal across settings. */
export const ATTRIBUTES = ["agility", "smarts", "spirit", "strength", "vigor"] as const;
export type AttributeName = (typeof ATTRIBUTES)[number];

/** Human-readable attribute labels. */
export const ATTRIBUTE_LABELS: Record<AttributeName, string> = {
  agility: "Agility",
  smarts: "Smarts",
  spirit: "Spirit",
  strength: "Strength",
  vigor: "Vigor",
};

/** Convert rank name to index (0–4). */
export function rankIndex(rank: string): number {
  const i = RANKS.indexOf(rank as Rank);
  return i < 0 ? 0 : i;
}

/** Advances required to reach each rank (0, 4, 8, 12, 16, 20). */
export const RANK_ADVANCES = [0, 4, 8, 12, 16, 20] as const;

/** Maximum die step for skills at a given rank (d6 until Seasoned). */
export function maxSkillStep(rank: string): number {
  return rankIndex(rank) < 1 ? 6 : 12;
}

/** Core skills every character starts with at d4. */
export const CORE_SKILLS = [
  "Athletics",
  "Common Knowledge",
  "Notice",
  "Persuasion",
  "Stealth",
] as const;

/** Map a die step number to its notation, e.g. 8 → "d8", 3 → "d4-1". */
export function stepNotation(step: number): string {
  return step === 3 ? "d4-1" : `d${step}`;
}

/** Derive rank from total advances (per SWADE advancement table). */
export function rankFromAdvances(advances: number): Rank {
  if (advances >= 16) return "Legendary";
  if (advances >= 12) return "Heroic";
  if (advances >= 8) return "Veteran";
  if (advances >= 4) return "Seasoned";
  return "Novice";
}

/** Bennies per session by rank (wild cards refresh each session). */
export const STARTING_BENNIES = 3;
