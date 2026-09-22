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
 * Mythic event focus table (d100) — 12 categories across 100
 * entries, following Mythic 2e's proportions (NPC trouble and
 * moving threads are the most common interruptions).
 */
const EVENT_FOCUS = [
  // Remote event (10)
  "Remote event", "Remote event", "Remote event", "Remote event", "Remote event",
  "Remote event", "Remote event", "Remote event", "Remote event", "Remote event",
  // NPC action (10)
  "Someone acts", "Someone acts", "Someone acts", "Someone acts", "Someone acts",
  "Someone acts", "Someone acts", "Someone acts", "Someone acts", "Someone acts",
  // NPC negative (15)
  "NPC negative", "NPC negative", "NPC negative", "NPC negative", "NPC negative",
  "NPC negative", "NPC negative", "NPC negative", "NPC negative", "NPC negative",
  "NPC negative", "NPC negative", "NPC negative", "NPC negative", "NPC negative",
  // Ambiguous event (10)
  "Ambiguous event", "Ambiguous event", "Ambiguous event", "Ambiguous event",
  "Ambiguous event", "Ambiguous event", "Ambiguous event", "Ambiguous event",
  "Ambiguous event", "Ambiguous event",
  // New NPC (10)
  "Introduce a new NPC", "Introduce a new NPC", "Introduce a new NPC",
  "Introduce a new NPC", "Introduce a new NPC", "Introduce a new NPC",
  "Introduce a new NPC", "Introduce a new NPC", "Introduce a new NPC",
  "Introduce a new NPC",
  // Thread resolved (5)
  "Thread progress toward", "Thread progress toward", "Thread progress toward",
  "Thread progress toward", "Thread progress toward",
  // PC positive (5)
  "PC positive", "PC positive", "PC positive", "PC positive", "PC positive",
  // PC negative (10)
  "PC negative", "PC negative", "PC negative", "PC negative", "PC negative",
  "PC negative", "PC negative", "PC negative", "PC negative", "PC negative",
  // Move toward thread (10)
  "Move toward a thread", "Move toward a thread", "Move toward a thread",
  "Move toward a thread", "Move toward a thread", "Move toward a thread",
  "Move toward a thread", "Move toward a thread", "Move toward a thread",
  "Move toward a thread",
  // Move away from thread (5)
  "Move away from a thread", "Move away from a thread", "Move away from a thread",
  "Move away from a thread", "Move away from a thread",
  // Close a thread (5)
  "Thread closes", "Thread closes", "Thread closes", "Thread closes", "Thread closes",
  // Wild event (5)
  "Wild event", "Wild event", "Wild event", "Wild event", "Wild event",
] as const;

/** Mythic action meaning table (d100 — 100 verb entries). */
const ACTION_WORDS = [
  "Ambush", "Alliance", "Arrival", "Attack", "Care",
  "Praise", "Communication", "Travel", "Hold", "Oppose",
  "Malice", "Neglect", "Discussion", "Punishment", "Change",
  "Continue", "Break", "Befriend", "Judgment", "Inspection",
  "Struggle", "Aid", "Retreat", "Advance", "Delay",
  "Return", "Give", "Agree", "Refuse", "Demand",
  "Bargain", "Threaten", "Protect", "Abandon", "Reveal",
  "Conceal", "Search", "Find", "Lose", "Steal",
  "Restore", "Destroy", "Build", "Divide", "Unite",
  "Lead", "Follow", "Escape", "Capture", "Kill",
  "Heal", "Wound", "Serve", "Rebel", "Obey",
  "Defy", "Spy", "Lie", "Confess", "Forgive",
  "Reward", "Claim", "Release", "Summon", "Banish",
  "Open", "Close", "Guard", "Infiltrate", "Negotiate",
  "Manipulate", "Inspire", "Disrupt", "Support", "Oppress",
  "Free", "Bind", "Guide", "Mislead", "Watch",
  "Ignore", "Depart", "Celebrate", "Mourn", "Challenge",
  "Submit", "Transform", "Corrupt", "Purify", "Witness",
  "Distract", "Prepare", "Fail", "Succeed", "Wait",
  "Rush", "Silence", "Inspect", "Expose",
] as const;

/** Mythic subject meaning table (d100 — 100 noun entries). */
const SUBJECT_WORDS = [
  "Goals", "Allies", "Enemies", "Battle", "Magic",
  "Nature", "Leadership", "Tension", "Military", "Technology",
  "Lie", "Expectations", "Advice", "Messages", "Path",
  "News", "Illusion", "Portals", "Intrigue", "Fears",
  "Environment", "Pleasures", "Pain", "Time", "Freedom",
  "Wealth", "Fortune", "Balance", "Danger", "Death",
  "Story", "Secrets", "Knowledge", "Jealousy", "Success",
  "Failure", "Animals", "Humanity", "Bureaucracy", "Judgment",
  "Family", "Honor", "Debt", "Contracts", "Home",
  "Road", "Ruins", "Bounty", "Weapons", "Poison",
  "Faith", "Ritual", "Blood", "Oath", "Stranger",
  "Child", "Ruler", "City", "Wilderness", "Storm",
  "Fire", "Water", "Cold", "Darkness", "Light",
  "Signal", "Silence", "Body", "Mind", "Memory",
  "Name", "Shadow", "Cage", "Key", "Door",
  "Coin", "Blade", "Beast", "Treasure", "Curse",
  "Prophecy", "Trap", "Rival", "Crew", "Ship",
  "Machine", "Plague", "Hunger", "Territory", "Law",
  "Truth", "Identity", "Love", "Revenge", "Legacy",
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
