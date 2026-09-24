/**
 * Campaign knowledge — the always-on digest the GM reads every turn.
 *
 * A real GM keeps a notebook: everything established so far, plus the
 * prep for what comes next. This module rebuilds that notebook from
 * stored data on every turn — no model call, no summarisation step —
 * and bounds it with a character budget so a long campaign cannot
 * crowd out the conversation itself.
 *
 * Two blocks come out of here:
 *   knowledge — established truth (facts, threads, cast, party, journal)
 *   prep      — the GM's forward plan (arcs, beats, clocks, NPC agendas)
 */

/** Total character budget for the two blocks combined. */
export const DIGEST_BUDGET = 8000;

/** Per-section budgets; the sum is DIGEST_BUDGET. */
export const SECTION_BUDGETS = {
  facts: 3000,
  prep: 2000,
  cast: 1000,
  threads: 800,
  journal: 800,
  party: 400,
} as const;

/** Fact categories the GM records against. */
export const FACT_CATEGORIES = [
  "Character",
  "Location",
  "Faction",
  "Item",
  "Event",
  "Promise",
  "Ruling",
  "Mystery",
] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];

/** Categories that read as open questions rather than settled detail. */
const OPEN_CATEGORIES = new Set<string>(["Promise", "Mystery"]);

export interface DigestFact {
  category: string;
  text: string;
  importance: number;
}

export interface DigestCast {
  name: string;
  stance: string;
  description?: string | null;
  agenda?: string | null;
  plan?: string | null;
}

export interface DigestArc {
  name: string;
  premise?: string | null;
  goal?: string | null;
  status: string;
}

export interface DigestBeat {
  title: string;
  detail?: string | null;
  status: string;
  arcName?: string | null;
}

export interface DigestClock {
  name: string;
  description?: string | null;
  current: number;
  max: number;
}

export interface DigestInput {
  facts: DigestFact[];
  threads: string[];
  cast: DigestCast[];
  party: string[];
  journal: string[];
  arcs: DigestArc[];
  beats: DigestBeat[];
  clocks: DigestClock[];
}

/**
 * Build the knowledge and prep blocks for the GM prompt.
 * Empty sections are omitted so short campaigns stay lean.
 */
export function buildCampaignDigest(input: DigestInput): {
  knowledge: string;
  prep: string;
} {
  const settled = input.facts.filter((f) => !OPEN_CATEGORIES.has(f.category));
  const open = input.facts.filter((f) => OPEN_CATEGORIES.has(f.category));

  const knowledgeBlocks = [
    section("FACTS (established — never contradict these):", settled.map(formatFact), SECTION_BUDGETS.facts),
    section("OPEN PROMISES & MYSTERIES:", open.map(formatFact), Math.min(1200, SECTION_BUDGETS.facts)),
    section("ACTIVE THREADS:", input.threads.map((t) => `- ${t}`), SECTION_BUDGETS.threads),
    section("CAST:", input.cast.map(formatCast), SECTION_BUDGETS.cast),
    section("PLAYER CHARACTERS:", input.party.map((p) => `- ${p}`), SECTION_BUDGETS.party),
    section("RECENT STORY:", input.journal.map((j) => `- ${j}`), SECTION_BUDGETS.journal),
  ].filter((block): block is string => block !== null);

  const prepBlocks = [
    section(
      "ARCS:",
      input.arcs.map((a) => `- [${a.status}] ${a.name}${a.goal ? ` — goal: ${a.goal}` : ""}${a.premise ? ` (${a.premise})` : ""}`),
      Math.min(900, SECTION_BUDGETS.prep),
    ),
    section(
      "UPCOMING EVENTS:",
      input.beats.map(
        (b) => `- [${b.status}] ${b.title}${b.arcName ? ` (${b.arcName})` : ""}${b.detail ? ` — ${b.detail}` : ""}`,
      ),
      Math.min(700, SECTION_BUDGETS.prep),
    ),
    section(
      "TENSION CLOCKS:",
      input.clocks.map(
        (c) => `- ${c.name}: ${c.current}/${c.max}${c.description ? ` — ${c.description}` : ""}`,
      ),
      Math.min(400, SECTION_BUDGETS.prep),
    ),
    section(
      "NPC AGENDAS:",
      input.cast
        .filter((c) => c.agenda || c.plan)
        .map(
          (c) =>
            `- ${c.name}${c.agenda ? ` — wants: ${c.agenda}` : ""}${c.plan ? `; doing: ${c.plan}` : ""}`,
        ),
      SECTION_BUDGETS.prep,
    ),
  ].filter((block): block is string => block !== null);

  return {
    knowledge: knowledgeBlocks.join("\n\n"),
    prep: prepBlocks.join("\n\n"),
  };
}

function formatFact(fact: DigestFact): string {
  const weight = fact.importance >= 3 ? "!" : "";
  return `- [${fact.category}]${weight} ${fact.text}`;
}

function formatCast(member: DigestCast): string {
  return `- ${member.name} (${member.stance})${member.description ? `: ${member.description}` : ""}`;
}

/**
 * Render one section, dropping the tail (lowest priority first, since
 * callers order by importance) when it would exceed its budget. A
 * trailing line reports how much was left out, so the GM knows the
 * notebook is deeper than what it can see.
 */
function section(header: string, lines: string[], budget: number): string | null {
  if (lines.length === 0) return null;

  /** Room kept aside for the truncation note, so it always has space. */
  const NOTE_RESERVE = 64;

  const kept: string[] = [];
  let used = header.length + 1;
  for (let i = 0; i < lines.length; i++) {
    const limit = i + 1 < lines.length ? budget - NOTE_RESERVE : budget;
    if (used + lines[i].length + 1 > limit) break;
    kept.push(lines[i]);
    used += lines[i].length + 1;
  }

  if (kept.length === 0) {
    const room = budget - header.length - 1;
    if (room < 40) return null;
    kept.push(`${lines[0].slice(0, room - 14)}…`);
  }

  const hidden = lines.length - kept.length;
  if (hidden > 0) {
    const note = `- (+${hidden} more not shown — search memory for the rest)`;
    if (used + note.length + 1 <= budget) kept.push(note);
  }

  return `${header}\n${kept.join("\n")}`;
}

/**
 * Normalise a fact for duplicate detection: case, accents, punctuation
 * and spacing stop mattering, so "The Tide Queen rules Ember Coast"
 * and "the tide queen rules ember coast." collapse to one fact.
 */
export function normalizeFactText(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
