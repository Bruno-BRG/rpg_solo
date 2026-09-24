/**
 * Savage Worlds combat procedures.
 *
 * Round-level procedures used by the UI dice tray, the API dice
 * route and the AI GM's combat tools:
 *   - initiative: d6 + d6 with jokers (doubles) and tie rerolls
 *   - attacks: trait roll vs the defender's Parry
 *   - damage: weapon dice (acing) + 1d6 per attack raise vs
 *     Toughness → Shaken / Wounds (extras are taken out outright)
 *   - Soak: Vigor roll — success clears Shaken, raises heal wounds
 *   - Unshake: Spirit roll to act again while Shaken
 *
 * Pure functions — no IO. See `dice.ts` for the die machinery.
 */
import { dN, rollDie, rollTrait, type TraitRollResult } from "./dice";

// ── Initiative (Action Deck) ─────────────────────────────────

export type ActorType = "wildcard" | "extra";

export interface InitiativeInput {
  name: string;
  /** Wild cards (PCs, named NPCs) vs extras (mooks). */
  actor?: ActorType;
}

/** The four suits, strongest first — that order breaks ties. */
export const SUITS = ["Spades", "Hearts", "Diamonds", "Clubs"] as const;
export type Suit = (typeof SUITS)[number];

/** Card ranks, low to high (Aces high). */
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export type CardRank = (typeof RANKS)[number];

/** One card from the Action Deck. Jokers are the two wild cards. */
export interface ActionCard {
  rank: CardRank | "Joker";
  suit: Suit | "Joker";
  joker: boolean;
  /** Display label, e.g. "A♠" or "Joker". */
  label: string;
}

const SUIT_GLYPH: Record<Suit, string> = {
  Spades: "♠",
  Hearts: "♥",
  Diamonds: "♦",
  Clubs: "♣",
};

/** A full Action Deck: 52 cards plus two Jokers. */
export function createActionDeck(): ActionCard[] {
  const deck: ActionCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, joker: false, label: rank + SUIT_GLYPH[suit] });
    }
  }
  deck.push({ rank: "Joker", suit: "Joker", joker: true, label: "Joker" });
  deck.push({ rank: "Joker", suit: "Joker", joker: true, label: "Joker" });
  return deck;
}

/** Fisher-Yates shuffle over a copy. */
export function shuffleDeck(deck: ActionCard[], random: () => number = Math.random): ActionCard[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Order value for a card: Jokers first, then rank (Aces high), then suit
 * (Spades, Hearts, Diamonds, Clubs). Higher goes earlier.
 */
export function cardScore(card: ActionCard): number {
  if (card.joker) return 10_000;
  const rank = RANKS.indexOf(card.rank as CardRank) + 1;
  const suit = SUITS.length - SUITS.indexOf(card.suit as Suit);
  return rank * 10 + suit;
}

export interface InitiativeEntry extends InitiativeInput {
  actor: ActorType;
  card: ActionCard;
  /** Jokers act whenever they like and get +2 to Trait and damage rolls. */
  joker: boolean;
  /** Sort key from the card. */
  score: number;
}

export interface DealResult {
  order: InitiativeEntry[];
  /** The deck left to deal from next round. */
  deck: ActionCard[];
  /** A Joker was dealt, so the deck is reshuffled for the next round. */
  reshuffled: boolean;
  jokerDealt: boolean;
}

/**
 * Deal one Action Card per combatant.
 *
 * SWADE: keep dealing from the same deck round after round; when a Joker
 * turns up, finish the round and reshuffle. The deck is also reshuffled
 * automatically if it runs too low to deal.
 */
export function dealRound(
  combatants: InitiativeInput[],
  deck: ActionCard[] = shuffleDeck(createActionDeck()),
  random: () => number = Math.random,
): DealResult {
  let working = deck;
  if (working.length < combatants.length) {
    working = shuffleDeck(createActionDeck(), random);
  }

  const entries: InitiativeEntry[] = [];
  const remaining = [...working];
  for (const combatant of combatants) {
    const card = remaining.shift() ?? createActionDeck()[0];
    entries.push({
      ...combatant,
      actor: combatant.actor ?? "extra",
      card,
      joker: card.joker,
      score: cardScore(card),
    });
  }

  const jokerDealt = entries.some((entry) => entry.joker);
  const nextDeck = jokerDealt ? shuffleDeck(createActionDeck(), random) : remaining;

  return {
    order: entries.sort((a, b) => b.score - a.score),
    deck: nextDeck,
    reshuffled: jokerDealt,
    jokerDealt,
  };
}

/** Convenience wrapper: deal a fresh round and return just the order. */
export function rollInitiative(combatants: InitiativeInput[]): InitiativeEntry[] {
  return dealRound(combatants).order;
}

// ── Attacks ──────────────────────────────────────────────────

export interface AttackResult extends TraitRollResult {
  /** Defender's Parry (the target number used). */
  parry: number;
  /** Convenience alias for `success`. */
  hit: boolean;
  /** True when the attack raise grants +1d6 on the damage roll. */
  bonusDamageDie: boolean;
}

/**
 * Attack roll: trait die + wild die vs the target's Parry.
 * A raise means +1d6 on the following damage roll (SWADE).
 */
export function attackRoll(
  traitStep: number,
  parry: number,
  modifier = 0,
): AttackResult {
  const roll = rollTrait(traitStep, parry, modifier);
  return {
    ...roll,
    label: `d${traitStep === 3 ? "4-1" : traitStep} vs Parry ${parry}`,
    parry,
    hit: roll.success,
    bonusDamageDie: roll.success && roll.raises > 0,
  };
}

// ── Damage ───────────────────────────────────────────────────

export interface DamageResult {
  /** Weapon die results (each die aces independently). */
  weaponRolls: number[];
  /** Bonus d6s from attack raises (also ace). */
  bonusRolls: number[];
  /** Situational modifier applied to the total. */
  modifier: number;
  /** Total damage. */
  total: number;
  /** Defender's Toughness. */
  toughness: number;
  /** Defender is Shaken. */
  shaken: boolean;
  /** Wounds inflicted (0–n; each +4 over Toughness beyond Shaken). */
  wounds: number;
  /** True when the defender is an extra and is taken out. */
  incapacitated: boolean;
  /** Target type the result was evaluated against. */
  targetIsExtra: boolean;
}

/**
 * Roll damage: weapon dice (acing) + one bonus d6 per attack
 * raise, then compare to Toughness.
 *
 * vs wildcard: total ≥ Toughness → Shaken; every +4 beyond that
 * (counting from Toughness) → one Wound.
 * vs extra: total ≥ Toughness → Shaken; ≥ Toughness + 4 → taken
 * out of the fight.
 */
export function damageRoll(
  weaponSides: number | number[],
  attackRaises = 0,
  toughness = 4,
  options: { isExtra?: boolean; modifier?: number } = {},
): DamageResult {
  const dice = Array.isArray(weaponSides) ? weaponSides : [weaponSides];
  const weaponRolls = dice.map((sides) => rollDie(sides).total);
  // One bonus d6 per raise on the attack roll (SWADE); d6s ace.
  const bonusRolls = Array.from({ length: Math.max(0, attackRaises) }, () =>
    rollDie(6).total,
  );
  const modifier = options.modifier ?? 0;
  const total = weaponRolls.reduce((a, b) => a + b, 0) +
    bonusRolls.reduce((a, b) => a + b, 0) + modifier;

  const isExtra = options.isExtra ?? false;
  const over = total - toughness;
  const shaken = over >= 0;
  // Wounds: +4 over Toughness = 1 wound, +8 = 2, etc.
  const wounds = over >= 4 ? Math.floor(over / 4) : 0;
  const incapacitated = isExtra && shaken;

  return {
    weaponRolls,
    bonusRolls,
    modifier,
    total,
    toughness,
    shaken,
    wounds: isExtra ? Math.max(wounds, shaken ? 1 : 0) : wounds,
    incapacitated,
    targetIsExtra: isExtra,
  };
}

// ── Defense reactions ────────────────────────────────────────

export interface SoakResult {
  roll: TraitRollResult;
  /** Wounds prevented: a success soaks one, each raise soaks another. */
  woundsHealed: number;
  /** True when every wound from the attack was soaked, clearing Shaken too. */
  unshaken: boolean;
}

/**
 * Soak: spend a Benny before the wounds are applied and roll Vigor at
 * TN 4. A success soaks one wound and each raise soaks another; if every
 * wound from the attack is soaked, Shaken is cleared as well. Wound
 * penalties from the attack being soaked do not apply to this roll.
 */
export function soakRoll(vigorStep: number, modifier = 0, incomingWounds = 1): SoakResult {
  const roll = rollTrait(vigorStep, 4, modifier);
  const woundsHealed = roll.success ? 1 + roll.raises : 0;
  return {
    roll,
    woundsHealed,
    unshaken: woundsHealed >= Math.max(1, incomingWounds),
  };
}

export interface UnshakeResult {
  roll: TraitRollResult;
  /** True when the character may act again this round. */
  unshaken: boolean;
}

/**
 * Recovering from Shaken on your turn: Spirit roll at TN 4.
 * (Free on a turn without other actions; see the combat notes.)
 */
export function unshakeRoll(spiritStep: number, modifier = 0): UnshakeResult {
  const roll = rollTrait(spiritStep, 4, modifier);
  return { roll, unshaken: roll.success };
}

// ── Round helpers ────────────────────────────────────────────

/** Apply damage to a simple wound counter (clamped at zero). */
export function applyWounds(currentWounds: number, incoming: number): number {
  return Math.max(0, currentWounds + incoming);
}

/** One-line summary for transcripts, journals and tool results. */
export function summarizeDamage(r: DamageResult): string {
  const dice = [...r.weaponRolls, ...r.bonusRolls].join("+");
  const base = `${dice}${r.modifier ? `+${r.modifier}` : ""} = ${r.total} vs Toughness ${r.toughness}`;
  if (r.incapacitated) return `${base} → taken out!`;
  if (r.wounds > 0) return `${base} → ${r.wounds} wound${r.wounds > 1 ? "s" : ""}${r.shaken ? " + Shaken" : ""}`;
  if (r.shaken) return `${base} → Shaken`;
  return `${base} → no effect`;
}

// ── Grid, terrain and line of sight ──────────────────────────

export interface Cell { x: number; y: number; }

/** Terrain kinds a cell can hold. */
export type TerrainKind = "wall" | "cover" | "difficult" | "hazard";

export interface TerrainCell extends Cell {
  kind: TerrainKind;
  label?: string | null;
}

export function cellKey(x: number, y: number): string {
  return x + "," + y;
}

/** Terrain on a cell, or null for open ground. */
export function terrainAt(terrain: TerrainCell[], x: number, y: number): TerrainCell | null {
  return terrain.find((cell) => cell.x === x && cell.y === y) ?? null;
}

/** Walls stop movement; everything else can be entered. */
export function blocksMovement(kind: TerrainKind): boolean {
  return kind === "wall";
}

/** Only walls stop sight; cover is handled as a penalty. */
export function blocksSight(kind: TerrainKind): boolean {
  return kind === "wall";
}

/** Movement points a cell costs: difficult ground and hazards cost double. */
export function movementCostOf(kind: TerrainKind | null): number {
  if (!kind) return 1;
  if (kind === "difficult" || kind === "hazard") return 2;
  return 1;
}

/** The eight neighbours of a cell, diagonals included. */
export const NEIGHBOURS: Cell[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

/** Chebyshev distance: a diagonal step costs one square. */
export function distanceSquares(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Two cells are adjacent when they touch, diagonals included. */
export function isAdjacent(a: Cell, b: Cell): boolean {
  if (a.x === b.x && a.y === b.y) return false;
  return distanceSquares(a, b) === 1;
}

/** Cells a straight line passes through, endpoints included (Bresenham). */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < 4096; guard++) {
    cells.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

export interface LineOfSight {
  clear: boolean;
  /** The wall that blocks the shot, when there is one. */
  blocker: Cell | null;
  /** Cover cells between the two, which become a penalty. */
  coverCells: Cell[];
}

/** Trace a line between two cells and report walls and cover along it. */
export function lineOfSight(a: Cell, b: Cell, terrain: TerrainCell[]): LineOfSight {
  const path = lineCells(a, b).slice(1, -1);
  const coverCells: Cell[] = [];
  for (const cell of path) {
    const here = terrainAt(terrain, cell.x, cell.y);
    if (!here) continue;
    if (blocksSight(here.kind)) return { clear: false, blocker: cell, coverCells };
    if (here.kind === "cover") coverCells.push(cell);
  }
  return { clear: true, blocker: null, coverCells };
}

/** Cover penalty for a shot: light cover is -2, heavier obstruction -4. */
export function coverPenalty(a: Cell, b: Cell, terrain: TerrainCell[]): number {
  const sight = lineOfSight(a, b, terrain);
  if (!sight.clear) return 0;
  if (sight.coverCells.length === 0) return 0;
  return sight.coverCells.length === 1 ? -2 : -4;
}

/**
 * Movement points to reach every cell within an allowance, honouring
 * walls, difficult ground and occupied squares. Returns a map keyed by
 * cellKey; unreachable cells are absent.
 */
export function reachableCells(
  from: Cell,
  terrain: TerrainCell[],
  allowance: number,
  width: number,
  height: number,
  occupied: Cell[] = [],
): Map<string, number> {
  const blocked = new Set(
    occupied
      .filter((cell) => !(cell.x === from.x && cell.y === from.y))
      .map((cell) => cellKey(cell.x, cell.y)),
  );
  const cost = new Map<string, number>([[cellKey(from.x, from.y), 0]]);
  const queue: Array<{ cell: Cell; cost: number }> = [{ cell: from, cost: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (!current) break;
    if (current.cost > (cost.get(cellKey(current.cell.x, current.cell.y)) ?? Infinity)) continue;

    for (const step of NEIGHBOURS) {
      const x = current.cell.x + step.x;
      const y = current.cell.y + step.y;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const key = cellKey(x, y);
      if (blocked.has(key)) continue;
      const here = terrainAt(terrain, x, y);
      if (here && blocksMovement(here.kind)) continue;
      const next = current.cost + movementCostOf(here ? here.kind : null);
      if (next > allowance) continue;
      if (next < (cost.get(key) ?? Infinity)) {
        cost.set(key, next);
        queue.push({ cell: { x, y }, cost: next });
      }
    }
  }

  return cost;
}

/** Cheapest movement cost between two cells, or Infinity when blocked. */
export function pathCost(
  from: Cell,
  to: Cell,
  terrain: TerrainCell[],
  width: number,
  height: number,
  occupied: Cell[] = [],
): number {
  const direct = distanceSquares(from, to);
  const reach = reachableCells(from, terrain, Math.max(direct * 2 + 4, 8), width, height, occupied);
  return reach.get(cellKey(to.x, to.y)) ?? Infinity;
}

// ── Range bands ──────────────────────────────────────────────

export type RangeBand = "short" | "medium" | "long" | "extreme" | "out";

/** Weapon reach in squares for each band. */
export interface WeaponRanges {
  short: number;
  medium: number;
  long: number;
  extreme: number;
}

export const DEFAULT_WEAPON_RANGES: WeaponRanges = {
  short: 4,
  medium: 8,
  long: 16,
  extreme: 32,
};

/** Ranged penalties by band. */
export const RANGE_PENALTIES: Record<Exclude<RangeBand, "out">, number> = {
  short: 0,
  medium: -2,
  long: -4,
  extreme: -8,
};

export interface RangeResult {
  band: RangeBand;
  penalty: number;
  inRange: boolean;
}

/** Which band a target falls into, and the penalty that carries. */
export function rangeBand(
  distance: number,
  ranges: WeaponRanges = DEFAULT_WEAPON_RANGES,
): RangeResult {
  if (distance <= ranges.short) return { band: "short", penalty: 0, inRange: true };
  if (distance <= ranges.medium) return { band: "medium", penalty: -2, inRange: true };
  if (distance <= ranges.long) return { band: "long", penalty: -4, inRange: true };
  if (distance <= ranges.extreme) return { band: "extreme", penalty: -8, inRange: true };
  return { band: "out", penalty: 0, inRange: false };
}

// ── Combat modifiers ─────────────────────────────────────────

export const WILD_ATTACK_BONUS = 2;
export const DEFEND_PARRY_BONUS = 2;
export const AIM_BONUS = 2;
export const RUNNING_PENALTY = -2;
export const MAX_GANG_UP = 4;
export const MAX_WOUND_PENALTY = 3;

/** Penalty for taking several actions in one turn: -2 per extra action. */
export function multiActionPenalty(totalActions: number): number {
  return -2 * Math.max(0, totalActions - 1);
}

/** Gang-up bonus: +1 per attacker beyond the first, capped at +4. */
export function gangUpBonus(attackers: number): number {
  return Math.min(MAX_GANG_UP, Math.max(0, attackers - 1));
}

/** Wound penalty on trait rolls: -1 per wound, capped at -3. */
export function woundPenalty(wounds: number): number {
  return -Math.min(MAX_WOUND_PENALTY, Math.max(0, wounds));
}

/** Movement allowance for the turn, adding the running die when sprinting. */
export function movementAllowance(pace: number, runningRoll = 0): number {
  return Math.max(0, pace) + Math.max(0, runningRoll);
}

export interface ModifierPart { label: string; value: number; }
export interface ModifierBreakdown {
  total: number;
  parts: ModifierPart[];
  /** True when a ranged target sits beyond Extreme range. */
  outOfRange: boolean;
}

export interface AttackModifierInput {
  /** Distance in squares (ignored for melee). */
  distance: number;
  ranges?: WeaponRanges;
  melee?: boolean;
  /** Attackers on the target, the attacker included. */
  gangUp?: number;
  cover?: number;
  wildAttack?: boolean;
  running?: boolean;
  /** Extra actions taken this turn beyond the first. */
  extraActions?: number;
  aim?: boolean;
  joker?: boolean;
  /** The attacker own wounds. */
  wounds?: number;
  situational?: number;
}

/**
 * Add up everything that modifies an attack roll. Defending is not
 * here: it raises the defender Parry instead, which the caller applies.
 */
export function attackModifiers(input: AttackModifierInput): ModifierBreakdown {
  const parts: ModifierPart[] = [];
  let outOfRange = false;

  if (!input.melee) {
    const range = rangeBand(input.distance, input.ranges ?? DEFAULT_WEAPON_RANGES);
    if (!range.inRange) outOfRange = true;
    else if (range.penalty !== 0) {
      parts.push({ label: "Range (" + range.band + ")", value: range.penalty });
    }
  }

  const gangUp = gangUpBonus(input.gangUp ?? 0);
  if (gangUp > 0) parts.push({ label: "Gang up", value: gangUp });
  if (input.cover) parts.push({ label: "Cover", value: input.cover });
  if (input.wildAttack) parts.push({ label: "Wild attack", value: WILD_ATTACK_BONUS });
  if (input.running) parts.push({ label: "Running", value: RUNNING_PENALTY });
  if (input.extraActions && input.extraActions > 0) {
    parts.push({ label: "Multiple actions", value: multiActionPenalty(input.extraActions + 1) });
  }
  if (input.aim) parts.push({ label: "Aiming", value: AIM_BONUS });
  if (input.joker) parts.push({ label: "Joker", value: 2 });
  const wounds = woundPenalty(input.wounds ?? 0);
  if (wounds !== 0) parts.push({ label: "Wounds", value: wounds });
  if (input.situational) parts.push({ label: "Situational", value: input.situational });

  return {
    total: parts.reduce((sum, part) => sum + part.value, 0),
    parts,
    outOfRange,
  };
}
