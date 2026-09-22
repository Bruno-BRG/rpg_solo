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

// ── Initiative ───────────────────────────────────────────────

export type ActorType = "wildcard" | "extra";

export interface InitiativeInput {
  name: string;
  /** Wild cards (PCs, named NPCs) vs extras (mooks). */
  actor?: ActorType;
}

export interface InitiativeEntry extends InitiativeInput {
  actor: ActorType;
  /** The two d6s rolled. */
  dice: [number, number];
  /** Sum of the dice. */
  total: number;
  /** Doubles = Joker: +2 to all actions this round. */
  joker: boolean;
  /** Effective order value (total + joker bonus). */
  score: number;
}

/**
 * Roll initiative for a combat round. Each participant rolls two
 * d6; doubles are a Joker (+2). Ties are rerolled among the tied
 * entries until the order is unique (bounded attempts).
 */
export function rollInitiative(combatants: InitiativeInput[]): InitiativeEntry[] {
  const entries: InitiativeEntry[] = combatants.map((c) => {
    const a: [number, number] = [dN(6), dN(6)];
    const joker = a[0] === a[1];
    const total = a[0] + a[1];
    return {
      ...c,
      actor: c.actor ?? "extra",
      dice: a,
      total,
      joker,
      score: total + (joker ? 2 : 0),
    };
  });

  // Break ties by rerolling only the tied dice (max 8 passes).
  for (let pass = 0; pass < 8; pass++) {
    const counts = new Map<number, number>();
    for (const e of entries) counts.set(e.score, (counts.get(e.score) ?? 0) + 1);
    const tied = entries.filter((e) => (counts.get(e.score) ?? 0) > 1);
    if (tied.length === 0) break;
    for (const e of tied) {
      e.dice = [dN(6), dN(6)];
      e.joker = e.dice[0] === e.dice[1];
      e.total = e.dice[0] + e.dice[1];
      e.score = e.total + (e.joker ? 2 : 0);
    }
  }

  return entries.sort((a, b) => b.score - a.score);
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
  /** Wounds removed by raises (never below zero). */
  woundsHealed: number;
  /** Success clears Shaken. */
  unshaken: boolean;
}

/**
 * Soak (full-round action): Vigor roll at TN 4. Success removes
 * Shaken; each raise removes one Wound.
 */
export function soakRoll(vigorStep: number, modifier = 0): SoakResult {
  const roll = rollTrait(vigorStep, 4, modifier);
  return {
    roll,
    woundsHealed: Math.max(0, roll.raises),
    unshaken: roll.success,
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
