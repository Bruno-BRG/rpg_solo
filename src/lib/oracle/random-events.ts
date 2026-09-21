/**
 * Mythic GM Emulator — Random Events & Detail Checks.
 *
 * Random events interrupt scenes with unexpected developments.
 * Detail checks (Action × Subject) generate focal points for
 * descriptions, scene alterations and NPC motivations.
 */

import { dN, rollPlain } from "../rules/dice";

// ── Random Events ────────────────────────────────────────────

/** The five random-event facets (Mythic 2e: focus + 3 sub-facets). */
export interface RandomEvent {
  /** Event focus: which part of the story the event touches. */
  focus: string;
  /** Action descriptor (what happens). */
  action: string;
  /** Subject descriptor (who/what it involves). */
  subject: string;
  /** Combined one-line event description. */
  description: string;
}

/**
 * Mythic event focus table (d100). Condensed to 20 bands —
 * each band covers 5 percentage points.
 */
const EVENT_FOCUS = [
  "NPC positive", "NPC negative", "Introduce a new NPC",
  "Thread progress toward", "Thread progress away from", "Thread closes",
  "PC positive", "PC negative", "Plot movement toward",
  "Plot movement away from", "Introduce a new thread", "Move toward a thread",
  "Move away from a thread", "Current context", "Remote event",
  "Someone acts", "New expectations", "Ambiguous event",
  "Wild event", "Something unusual",
] as const;

/** Mythic action meaning table (d100, condensed to 40 verb bands). */
const ACTION_WORDS = [
  "Attainment", "Starting", "Opposition", "Release", "New", "Oppose",
  "Malice", "Negotiate", "Arrive", "Change", "Pursue", "Increase",
  "Decrease", "War", "Break", "Reach", "Strive", "Support",
  "Stop", "Bring", "Oppress", "Disrupt", "Open", "Inside",
  "Fight", "Outside", "Guide", "Communicate", "Discard", "Imitate",
  "Move", "Delay", "Return", "Give", "Agree", "Inspection",
  "Spy", "Align", "Wound", "Possess",
] as const;

/** Mythic subject meaning table (d100, condensed to 40 noun bands). */
const SUBJECT_WORDS = [
  "Goals", "Allies", "Enemies", "Battle", "Magic", "Nature",
  "Leadership", "Tension", "Military", "Technology", "Lie", "Expectations",
  "Advice", "Messages", "Path", "News", "Illusion", "Portals",
  "Intrigue", "Fears", "Environment", "Pleasures", "Pain", "Time",
  "Freedom", "Wealth", "Fortune", "Balance", "Danger", "Death",
  "Story", "Secrets", "Knowledge", "Jealousy", "Success", "Failure",
  "Animals", "Humanitarian", "Bureaucracy", "Judgment",
] as const;

/** Pick a band from a condensed table of `len` entries. */
function pickBand(table: readonly string[], len: number): string {
  return table[Math.floor((dN(100) - 1) / (100 / len))];
}

/** Generate a complete random event. */
export function randomEvent(): RandomEvent {
  const focus = pickBand(EVENT_FOCUS, EVENT_FOCUS.length);
  const action = pickBand(ACTION_WORDS, ACTION_WORDS.length);
  const subject = pickBand(SUBJECT_WORDS, SUBJECT_WORDS.length);
  return {
    focus,
    action,
    subject,
    description: `${action} / ${subject}`,
  };
}

// ── Detail Checks ────────────────────────────────────────────

export interface DetailCheck {
  /** Detail check kind: "Action" or "Subject". */
  kind: "Action" | "Subject";
  /** The descriptor rolled. */
  word: string;
}

/** Roll an Action detail (behavior/motion descriptor). */
export function detailAction(): DetailCheck {
  return { kind: "Action", word: pickBand(ACTION_WORDS, ACTION_WORDS.length) };
}

/** Roll a Subject detail (topic/entity descriptor). */
export function detailSubject(): DetailCheck {
  return { kind: "Subject", word: pickBand(SUBJECT_WORDS, SUBJECT_WORDS.length) };
}

// ── Scene setup ──────────────────────────────────────────────

/** Scene setup result per Mythic scene generation. */
export interface SceneSetup {
  /** "Set" = expected scene; "Altered" = modified; "Interrupt" = random event. */
  type: "Set" | "Altered" | "Interrupt";
  /** Rolled description fragments when Altered/Interrupt. */
  description?: RandomEvent;
}

/**
 * Set up a scene: roll d10 against the chaos-modified expected-scene
 * odds (Mythic: altered scenes become more common at high chaos).
 */
export function setupScene(chaosRank: number): SceneSetup {
  const roll = dN(10);
  // Higher chaos → higher chance of alteration/interruption.
  const alteredFrom = Math.max(2, 8 - Math.floor(chaosRank / 3));
  if (roll === 1) return { type: "Interrupt", description: randomEvent() };
  if (roll < alteredFrom) return { type: "Altered", description: randomEvent() };
  return { type: "Set" };
}

/** Roll on a custom d100 table provided as an array of entries. */
export function rollCustomTable(entries: string[]): string {
  if (entries.length === 0) return "";
  const index = Math.min(
    entries.length - 1,
    Math.floor((dN(100) - 1) / (100 / entries.length)),
  );
  return entries[index];
}

/** Convenience: roll 2d6 (used by some house-rule oracles). */
export function d66(): number {
  const [a, b] = rollPlain(6, 2);
  return a * 10 + b;
}
