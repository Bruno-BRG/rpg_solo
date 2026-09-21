/**
 * Mythic GM Emulator — Fate Chart.
 *
 * The heart of the oracle: given a question's likelihood and the
 * current chaos rank, roll percentiles against a threshold matrix
 * and interpret the result as No/Yes (possibly exceptional).
 *
 * Reference: Mythic GM Emulator (Tana Pigeon, Word Mill).
 * Values follow the standard SWADE-adapted Mythic matrix.
 */

/** Mythic likelihood tiers. */
export const LIKELIHOODS = [
  "Almost Impossible",
  "Very Unlikely",
  "Unlikely",
  "50/50",
  "Likely",
  "Very Likely",
  "Almost Certain",
] as const;
export type Likelihood = (typeof LIKELIHOODS)[number];

/** Chaos rank: 1 (boring) … 9 (insane). Default 5. */
export const CHAOS_MIN = 1;
export const CHAOS_MAX = 9;

/**
 * Base "Yes" thresholds per likelihood at chaos 5 (average).
 * Index maps to LIKELIHOODS order. Values are the minimum d100
 * roll (inclusive) that yields "Yes".
 */
const BASE_THRESHOLDS: Record<Likelihood, number> = {
  "Almost Impossible": 96,
  "Very Unlikely": 90,
  "Unlikely": 75,
  "50/50": 51,
  "Likely": 26,
  "Very Likely": 11,
  "Almost Certain": 6,
};

/** Chaos rank shifts the threshold: low chaos favors "No". */
function chaosAdjustment(chaosRank: number): number {
  // Each point of chaos above 5 shifts odds ~5% toward Yes;
  // below 5 shifts toward No. Bounded to ±4 steps.
  return (5 - chaosRank) * 5;
}

/** Possible fate chart answers. */
export type FateAnswer =
  | "Exceptional No"
  | "No"
  | "Yes"
  | "Exceptional Yes";

export interface FateChartResult {
  question: string;
  likelihood: Likelihood;
  chaosRank: number;
  /** The two d100 rolls (tens digit via d10, ones via d10 — emulated). */
  roll: number;
  /** Adjusted threshold used for the decision. */
  threshold: number;
  answer: FateAnswer;
  /** Doubles on matching digits → dramatic/random-event trigger (Mythic). */
  randomEvent: boolean;
}

/**
 * Ask the fate chart. Rolls d100 and compares against the
 * chaos-adjusted threshold for the given likelihood.
 *
 * Exceptional results: roll 20+ away from threshold in the
 * answer's direction (Mythic's "extreme yes/no" margin).
 */
export function askFateChart(
  question: string,
  likelihood: Likelihood,
  chaosRank: number,
): FateChartResult {
  const clampedChaos = Math.min(CHAOS_MAX, Math.max(CHAOS_MIN, chaosRank));
  const roll = d100();
  const threshold = Math.min(
    99,
    Math.max(2, BASE_THRESHOLDS[likelihood] + chaosAdjustment(clampedChaos)),
  );

  const isYes = roll >= threshold;
  const margin = Math.abs(roll - threshold);

  let answer: FateAnswer;
  if (isYes) {
    answer = margin >= 20 ? "Exceptional Yes" : "Yes";
  } else {
    answer = margin >= 20 ? "Exceptional No" : "No";
  }

  // Mythic: doubled digits (11, 22, 33…) trigger a random event
  // when the answer is "Yes" (chaos ≥ 5) or "No" (chaos < 5).
  const doubled = isDoubled(roll);
  const eventOnYes = clampedChaos >= 5;
  const randomEvent = doubled && (isYes ? eventOnYes : !eventOnYes);

  return {
    question,
    likelihood,
    chaosRank: clampedChaos,
    roll,
    threshold,
    answer,
    randomEvent,
  };
}

/** Roll 1–100. */
function d100(): number {
  return 1 + Math.floor(Math.random() * 100);
}

/** True when both digits match (11, 22, … 99). */
function isDoubled(n: number): boolean {
  const s = String(n).padStart(2, "0");
  return s[0] === s[1];
}

/** Human-readable summary for logs and the UI. */
export function formatFateResult(r: FateChartResult): string {
  const event = r.randomEvent ? " ⚡ random event!" : "";
  return `${r.answer} (rolled ${r.roll} vs ${r.threshold}${event})`;
}
