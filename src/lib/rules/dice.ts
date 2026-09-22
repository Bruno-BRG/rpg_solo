/**
 * Savage Worlds die mechanics.
 *
 * Savage Worlds rolls "wild" — a trait die AND a wild die (d6),
 * taking the better result. Rolls can "ace" (explode): on a max
 * result the die is rolled again and totals are summed.
 *
 * Die steps are represented by their sides: d4=4 … d12=12.
 * A d4-1 penalty step is represented as 3 with `isPenalty`.
 */

/** Supported die steps in Savage Worlds. */
export const DIE_STEPS = [4, 6, 8, 10, 12] as const;

export type DieStep = (typeof DIE_STEPS)[number];

/** Sides for a die step; 3 represents the d4-1 penalty step. */
export function dieSides(step: number): number {
  return step === 3 ? 4 : step;
}

/** Modifier applied to a d4-1 penalty step roll. */
export function stepModifier(step: number): number {
  return step === 3 ? -1 : 0;
}

/** Roll a single die with acing; returns total and every roll made. */
export function rollDie(sides: number): { total: number; rolls: number[] } {
  const rolls: number[] = [];
  let total = 0;
  // Safety bound: absurd chains are theoretically infinite.
  for (let i = 0; i < 100; i++) {
    const roll = 1 + Math.floor(Math.random() * sides);
    rolls.push(roll);
    total += roll;
    if (roll < sides) break; // no ace
  }
  return { total, rolls };
}

/** Result of a full trait roll (trait die + wild die). */
export interface TraitRollResult {
  /** Dice notation, e.g. "d8 vs 4". */
  label: string;
  /** Trait die step (3 = d4-1). */
  traitStep: number;
  /** Trait die rolls (possibly multiple when acing). */
  traitRolls: number[];
  /** Wild die rolls (d6, possibly multiple when acing). */
  wildRolls: number[];
  /** Best of the two totals (after modifier). */
  total: number;
  /** Which die won: "trait" | "wild". */
  usedDie: "trait" | "wild";
  /** Target number (default 4). */
  targetNumber: number;
  /** Success and raises (each raise = +4 over target). */
  success: boolean;
  raises: number;
  /** Critical failure: both dice rolled a 1 (before modifier). */
  criticalFailure: boolean;
}

/**
 * Roll a trait: trait die + wild die, take the better, apply the
 * d4-1 modifier when needed, evaluate vs target number.
 */
export function rollTrait(
  traitStep: number,
  targetNumber = 4,
  modifier = 0,
): TraitRollResult {
  const sides = dieSides(traitStep);
  const mod = stepModifier(traitStep) + modifier;

  const trait = rollDie(sides);
  const wild = rollDie(6);

  // Situational modifiers apply to the final total of EITHER die;
  // only the d4-1 step penalty is trait-die specific.
  const traitTotal = trait.total + stepModifier(traitStep) + modifier;
  const wildTotal = wild.total + modifier;

  const usedTrait = traitTotal >= wildTotal;
  const total = usedTrait ? traitTotal : wildTotal;

  const bothOnes = trait.rolls[0] === 1 && wild.rolls[0] === 1;
  const over = total - targetNumber;

  return {
    label: `d${sides}${traitStep === 3 ? "-1" : ""} vs ${targetNumber}`,
    traitStep,
    traitRolls: trait.rolls,
    wildRolls: wild.rolls,
    total,
    usedDie: usedTrait ? "trait" : "wild",
    targetNumber,
    success: !bothOnes && total >= targetNumber,
    raises: bothOnes ? -1 : Math.max(0, Math.floor(over / 4)),
    criticalFailure: bothOnes,
  };
}

/** Roll a plain die (no wild die) — NPCs, damage, oracle utilities. */
export function rollPlain(sides: number, count = 1): number[] {
  return Array.from({ length: count }, () => rollDie(sides).total);
}

/** Random integer in [1, sides]. */
export function dN(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}
