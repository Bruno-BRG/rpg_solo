/**
 * Encounter helpers — reading, rendering and syncing grid combat.
 *
 * The rules live in lib/rules/combat.ts (pure). This module is the IO
 * seam: it loads the active encounter, turns stored JSON back into
 * terrain and cards, renders the board as text for the GM and the log,
 * and writes wounds back to the linked character sheets.
 */
import { prisma } from "../db";
import {
  createActionDeck,
  type ActionCard,
  type TerrainCell,
  type TerrainKind,
} from "../rules/combat";

export const TERRAIN_KINDS: TerrainKind[] = ["wall", "cover", "difficult", "hazard"];

/** Terrain glyphs used by the text renderer. */
const TERRAIN_GLYPH: Record<TerrainKind, string> = {
  wall: "#",
  cover: "+",
  difficult: "~",
  hazard: "!",
};

const TOKEN_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Parse stored terrain JSON into typed cells, dropping anything invalid. */
export function terrainFromJson(value: unknown): TerrainCell[] {
  if (!Array.isArray(value)) return [];
  const cells: TerrainCell[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const cell = raw as Record<string, unknown>;
    const x = Number(cell.x);
    const y = Number(cell.y);
    const kind = String(cell.kind ?? "");
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (!TERRAIN_KINDS.includes(kind as TerrainKind)) continue;
    cells.push({
      x,
      y,
      kind: kind as TerrainKind,
      label: typeof cell.label === "string" ? cell.label : null,
    });
  }
  return cells;
}

/** Parse a stored Action Card. */
export function cardFromJson(value: unknown): ActionCard | null {
  if (!value || typeof value !== "object") return null;
  const card = value as Record<string, unknown>;
  if (card.joker === true) {
    return { rank: "Joker", suit: "Joker", joker: true, label: "Joker" };
  }
  const rank = String(card.rank ?? "");
  const suit = String(card.suit ?? "");
  if (!rank || !suit) return null;
  return {
    rank: rank as ActionCard["rank"],
    suit: suit as ActionCard["suit"],
    joker: false,
    label: typeof card.label === "string" ? card.label : rank,
  };
}

/** Parse the stored deck; an empty or broken deck becomes a fresh one. */
export function deckFromJson(value: unknown): ActionCard[] {
  if (!Array.isArray(value)) return createActionDeck();
  const cards: ActionCard[] = [];
  for (const raw of value) {
    const card = cardFromJson(raw);
    if (card) cards.push(card);
  }
  return cards.length > 0 ? cards : createActionDeck();
}

export interface CombatantLike {
  name: string;
  x: number;
  y: number;
  wounds: number;
  maxWounds: number;
  shaken: boolean;
  status: string;
  isExtra: boolean;
  card?: unknown;
}

/**
 * Render the board as text so the GM can see positions in its own
 * context. Walls are #, cover +, difficult ground ~, hazards !, and each
 * combatant is a letter listed in the legend below the grid.
 */
export function renderGrid(
  encounter: { width: number; height: number; terrain: unknown },
  combatants: CombatantLike[],
): string {
  const terrain = terrainFromJson(encounter.terrain);
  const width = Math.max(1, encounter.width);
  const height = Math.max(1, encounter.height);
  const letters = new Map<string, string>();
  combatants.forEach((combatant, index) => {
    letters.set(combatant.name, TOKEN_LETTERS[index % TOKEN_LETTERS.length]);
  });

  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const occupant = combatants.find((c) => c.x === x && c.y === y);
      if (occupant) {
        row += letters.get(occupant.name) ?? "?";
        continue;
      }
      const cell = terrain.find((t) => t.x === x && t.y === y);
      row += cell ? TERRAIN_GLYPH[cell.kind] : ".";
    }
    rows.push(String(y).padStart(2, " ") + " " + row);
  }

  const header = "   " + Array.from({ length: width }, (_, x) => x % 10).join("");
  const legend = combatants.map((combatant) => {
    const letter = letters.get(combatant.name) ?? "?";
    const state = [
      combatant.isExtra ? "extra" : "wildcard",
      combatant.status !== "Active" ? combatant.status : null,
      combatant.wounds > 0 ? combatant.wounds + " wound(s)" : null,
      combatant.shaken ? "Shaken" : null,
    ]
      .filter(Boolean)
      .join(", ");
    const card = cardFromJson(combatant.card);
    return "  " + letter + " " + combatant.name + " (" + combatant.x + "," + combatant.y + ")" +
      (state ? " — " + state : "") +
      (card ? " · " + card.label : "");
  });

  return [header, ...rows].join("\n") + (legend.length ? "\n" + legend.join("\n") : "");
}

/** The encounter the campaign is currently fighting, if any. */
export async function getActiveEncounter(campaignId: string) {
  return prisma.encounter.findFirst({
    where: { campaignId, status: { in: ["Setup", "Active"] } },
    orderBy: { createdAt: "desc" },
    include: { combatants: { orderBy: { createdAt: "asc" } } },
  });
}

/** Write a combatant's condition back to its character sheet. */
export async function syncCombatantToSheet(combatant: {
  characterId: string | null;
  wounds: number;
  shaken: boolean;
  bennies: number;
}): Promise<void> {
  if (!combatant.characterId) return;
  await prisma.character
    .updateMany({
      where: { id: combatant.characterId },
      data: {
        wounds: combatant.wounds,
        shaken: combatant.shaken,
        bennies: combatant.bennies,
      },
    })
    .catch(() => undefined);
}

/** Append a line to the encounter history. */
export async function logEncounter(
  encounterId: string,
  round: number,
  kind: string,
  text: string,
  data?: unknown,
): Promise<void> {
  await prisma.encounterLog
    .create({
      data: { encounterId, round, kind, text, data: (data ?? undefined) as object | undefined },
    })
    .catch(() => undefined);
}

/** A short summary of the board for the GM prompt. */
export function renderEncounterForPrompt(
  encounter: { name: string; round: number; width: number; height: number; terrain: unknown },
  combatants: CombatantLike[],
): string {
  const lines = [
    encounter.name + " — round " + encounter.round + " (" + encounter.width + "x" + encounter.height + " grid)",
  ];
  const order = [...combatants]
    .filter((c) => cardFromJson(c.card))
    .sort((a, b) => {
      const ca = cardFromJson(a.card);
      const cb = cardFromJson(b.card);
      const ja = ca?.joker ? 1 : 0;
      const jb = cb?.joker ? 1 : 0;
      if (ja !== jb) return jb - ja;
      return 0;
    });
  if (order.length) {
    lines.push(
      "Initiative: " +
        order
          .map((c) => {
            const card = cardFromJson(c.card);
            return c.name + " " + (card?.label ?? "?");
          })
          .join(" > "),
    );
  }
  lines.push(
    "Combatants: " +
      combatants
        .map((c) => {
          const bits = [
            c.name + " (" + c.x + "," + c.y + ")",
            c.status !== "Active" ? c.status : null,
            c.wounds + "/" + c.maxWounds + " wounds",
            c.shaken ? "Shaken" : null,
          ].filter(Boolean);
          return bits.join(" ");
        })
        .join("; "),
  );
  const terrain = terrainFromJson(encounter.terrain);
  if (terrain.length) {
    const walls = terrain.filter((t) => t.kind === "wall").length;
    const cover = terrain.filter((t) => t.kind === "cover").length;
    const rough = terrain.filter((t) => t.kind === "difficult").length;
    const hazards = terrain.filter((t) => t.kind === "hazard").length;
    lines.push(
      "Terrain: " + walls + " wall(s), " + cover + " cover, " + rough + " difficult, " + hazards + " hazard(s).",
    );
  }
  return lines.join("\n");
}

