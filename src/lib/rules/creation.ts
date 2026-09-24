/**
 * Savage Worlds character creation rules.
 *
 * The single source of truth for what a legal starting character looks
 * like: budgets, per-step costs, the skill/attribute table and the
 * edge/hindrance catalogue. Pure functions — no IO — so the creator UI,
 * the guide panel and the API validation all agree by construction.
 *
 * SWADE starting package: attributes begin at d4 with 5 points to
 * distribute, the five core skills start at d4 for free, 12 points buy
 * skills (1 per step up to the linked attribute, 2 per step above it),
 * and up to 4 points of Hindrances buy an Edge (2), an attribute step
 * (2) or a skill step (1). Everything caps at d12 at creation.
 */
import { CORE_SKILLS, type AttributeName } from "./ranks";

/** Creation budgets and caps. */
export const CREATION = {
  attributePoints: 5,
  skillPoints: 12,
  hindrancePointsMax: 4,
  freeEdges: 1,
  baseAttribute: 4,
  maxStep: 12,
} as const;

/** Die steps a player may buy, in order (0 = untrained, rolled at d4−2). */
export const STEP_LADDER = [0, 4, 6, 8, 10, 12] as const;

/** What one point of Hindrance buys. */
export const HINDRANCE_SPEND = {
  edge: 2,
  attributeStep: 2,
  skillStep: 1,
} as const;

export interface SkillDefinition {
  name: string;
  attribute: AttributeName;
  /** Core skills start at d4 for free. */
  core: boolean;
  /** One line the guide shows when the player hovers the skill. */
  hint: string;
}

const CORE = new Set<string>(CORE_SKILLS);

/** Every SWADE skill and the attribute it is rolled with. */
export const SKILLS: SkillDefinition[] = [
  { name: "Athletics", attribute: "agility", hint: "Climbing, swimming, running, grappling." },
  { name: "Common Knowledge", attribute: "smarts", hint: "What an ordinary person of your world would know." },
  { name: "Notice", attribute: "smarts", hint: "Spotting details, hearing trouble, avoiding surprise." },
  { name: "Persuasion", attribute: "spirit", hint: "Convincing people through reason and charm." },
  { name: "Stealth", attribute: "agility", hint: "Moving unseen and unheard." },
  { name: "Fighting", attribute: "agility", hint: "Melee attacks. Sets your Parry." },
  { name: "Shooting", attribute: "agility", hint: "Ranged attacks with guns, bows and thrown-in weapons." },
  { name: "Throwing", attribute: "agility", hint: "Grenades, knives and anything you hurl." },
  { name: "Riding", attribute: "agility", hint: "Staying on and controlling a mount." },
  { name: "Boating", attribute: "agility", hint: "Handling boats and ships." },
  { name: "Driving", attribute: "agility", hint: "Cars, trucks and tracked vehicles." },
  { name: "Piloting", attribute: "agility", hint: "Aircraft and hovercraft." },
  { name: "Intimidation", attribute: "spirit", hint: "Threatening someone into backing down." },
  { name: "Performance", attribute: "spirit", hint: "Playing to a crowd, singing, acting, lying big." },
  { name: "Taunt", attribute: "spirit", hint: "Getting under someone's skin." },
  { name: "Focus", attribute: "spirit", hint: "Concentrating on powers under pressure." },
  { name: "Faith", attribute: "spirit", hint: "Arcane skill for miracles." },
  { name: "Healing", attribute: "smarts", hint: "Patches wounds, treats disease and poison." },
  { name: "Repair", attribute: "smarts", hint: "Fixing, building and sabotaging machines." },
  { name: "Science", attribute: "smarts", hint: "Hard science and engineering theory." },
  { name: "Research", attribute: "smarts", hint: "Digging answers out of records and libraries." },
  { name: "Survival", attribute: "smarts", hint: "Tracking, foraging and living off the land." },
  { name: "Occult", attribute: "smarts", hint: "Lore of magic, monsters and the supernatural." },
  { name: "Electronics", attribute: "smarts", hint: "Wiring, sensors, surveillance gear." },
  { name: "Hacking", attribute: "smarts", hint: "Breaking into computer systems." },
  { name: "Gambling", attribute: "smarts", hint: "Cards, dice and reading the table." },
  { name: "Language", attribute: "smarts", hint: "A language beyond your native tongue." },
  { name: "Spellcasting", attribute: "smarts", hint: "Arcane skill for wizards and mages." },
  { name: "Weird Science", attribute: "smarts", hint: "Arcane skill for gadgeteers." },
  { name: "Psionics", attribute: "smarts", hint: "Arcane skill for the gifted." },
].map((s) => ({ ...s, core: CORE.has(s.name) })) as SkillDefinition[];

/** Lookup by name. */
export const SKILL_INDEX: Record<string, SkillDefinition> = Object.fromEntries(
  SKILLS.map((s) => [s.name, s]),
);

// ── Costs ────────────────────────────────────────────────────

/** Steps bought to go from `base` to `target` (exclusive of base). */
function purchasedSteps(base: number, target: number): number[] {
  const from = STEP_LADDER.indexOf(base as (typeof STEP_LADDER)[number]);
  const to = STEP_LADDER.indexOf(target as (typeof STEP_LADDER)[number]);
  if (from < 0 || to < 0 || to <= from) return [];
  return STEP_LADDER.slice(from + 1, to + 1) as unknown as number[];
}

/**
 * Points a skill costs at `targetStep`. Core skills start at d4 free;
 * steps up to the linked attribute cost 1, steps above it cost 2.
 */
export function skillCost(
  skill: string,
  targetStep: number,
  attributes: Record<string, number>,
): number {
  const info = SKILL_INDEX[skill];
  if (!info) return 0;
  const attribute = attributes[info.attribute] ?? CREATION.baseAttribute;
  const base = info.core ? CREATION.baseAttribute : 0;
  return purchasedSteps(base, targetStep).reduce(
    (sum, step) => sum + (step > attribute ? 2 : 1),
    0,
  );
}

/** Attribute points spent: one per step above d4. */
export function attributePointsSpent(attributes: Record<string, number>): number {
  return Object.values(attributes).reduce(
    (sum, step) => sum + Math.max(0, step - CREATION.baseAttribute),
    0,
  );
}

/** Skill points spent across the whole sheet. */
export function skillPointsSpent(
  skills: Record<string, number>,
  attributes: Record<string, number>,
): number {
  return Object.entries(skills).reduce(
    (sum, [skill, step]) => sum + skillCost(skill, step, attributes),
    0,
  );
}

// ── Hindrances ───────────────────────────────────────────────

export type Severity = "Minor" | "Major";

export interface HindranceDefinition {
  name: string;
  /** Minor = 1 point, Major = 2; "either" lets the player choose. */
  severity: Severity | "either";
  hint: string;
}

/** Hindrances with the severity (and therefore the point value) they carry. */
export const HINDRANCES: HindranceDefinition[] = [
  { name: "All Thumbs", severity: "Minor", hint: "−2 with mechanical and electronic devices; a 1 breaks them." },
  { name: "Anemic", severity: "Minor", hint: "−2 to resist Fatigue." },
  { name: "Arrogant", severity: "Major", hint: "You must prove you are the best, even when it is stupid." },
  { name: "Bad Eyes", severity: "either", hint: "−2 to sight-based Notice and ranged attacks without glasses." },
  { name: "Big Mouth", severity: "Major", hint: "You cannot keep a secret." },
  { name: "Blind", severity: "Major", hint: "−6 to anything needing sight; other senses must carry you." },
  { name: "Bloodthirsty", severity: "Major", hint: "You never take prisoners." },
  { name: "Cautious", severity: "Minor", hint: "You plan everything and avoid risk." },
  { name: "Clueless", severity: "Major", hint: "−2 to Common Knowledge and Notice." },
  { name: "Code of Honor", severity: "Major", hint: "You keep your word, always." },
  { name: "Curious", severity: "Major", hint: "You must investigate anything interesting." },
  { name: "Death Wish", severity: "Minor", hint: "You want to die gloriously." },
  { name: "Delusional", severity: "either", hint: "You believe something demonstrably false." },
  { name: "Doubting Thomas", severity: "Minor", hint: "−2 against faith and the supernatural." },
  { name: "Elderly", severity: "Major", hint: "Pace −1, −1 Strength and Vigor, but more skill points." },
  { name: "Enemy", severity: "either", hint: "Someone out there wants you ruined or dead." },
  { name: "Greedy", severity: "either", hint: "You cannot leave money alone." },
  { name: "Hard of Hearing", severity: "either", hint: "−2 to hearing-based Notice; hard to wake you." },
  { name: "Hesitant", severity: "Minor", hint: "You act late in the round." },
  { name: "Heroic", severity: "Major", hint: "You help anyone in need, whatever it costs." },
  { name: "Illiterate", severity: "Minor", hint: "You cannot read or write." },
  { name: "Lame", severity: "Major", hint: "Pace −2 and a d4 running die." },
  { name: "Mean", severity: "Minor", hint: "−1 to Persuasion." },
  { name: "Mild Mannered", severity: "Minor", hint: "−2 to Intimidation." },
  { name: "Obese", severity: "Minor", hint: "Size +1, Pace −1, d4 running die." },
  { name: "One Arm", severity: "Major", hint: "−4 to anything needing two hands." },
  { name: "One Eye", severity: "Major", hint: "−2 to sight-based Notice and ranged attacks." },
  { name: "Outsider", severity: "Minor", hint: "−2 to Persuasion with people outside your own." },
  { name: "Overconfident", severity: "Major", hint: "You think you can handle anything." },
  { name: "Pacifist", severity: "either", hint: "You avoid killing, or all violence." },
  { name: "Phantom Pain", severity: "either", hint: "An old wound still costs you." },
  { name: "Phobia", severity: "either", hint: "−2 to −4 when your fear is present." },
  { name: "Quirk", severity: "Minor", hint: "A small, telling oddity." },
  { name: "Ruthless", severity: "either", hint: "You will do whatever it takes." },
  { name: "Slow", severity: "Minor", hint: "Pace −1 and a d4 running die." },
  { name: "Small", severity: "Minor", hint: "Size −1 and −1 Toughness." },
  { name: "Stubborn", severity: "Minor", hint: "You never admit you are wrong." },
  { name: "Ugly", severity: "Minor", hint: "−2 to Persuasion." },
  { name: "Vengeful", severity: "either", hint: "You settle every slight." },
  { name: "Vow", severity: "either", hint: "A binding promise shapes your choices." },
  { name: "Wanted", severity: "either", hint: "The law, or someone, is after you." },
  { name: "Young", severity: "Major", hint: "Fewer attribute points, more skill points." },
  { name: "Yellow", severity: "Major", hint: "−2 to Fear checks." },
];

export const HINDRANCE_INDEX: Record<string, HindranceDefinition> = Object.fromEntries(
  HINDRANCES.map((h) => [h.name, h]),
);

/** Stored label for a hindrance, carrying its severity. */
export function hindranceLabel(name: string, severity: Severity): string {
  return severity === "Major" ? `${name} (Major)` : name;
}

/** Read a stored hindrance label back into name + severity. */
export function parseHindrance(label: string): { name: string; severity: Severity } {
  const match = /^(.*) \((Major|Minor)\)$/.exec(label.trim());
  const name = match ? match[1] : label.trim();
  const severity = (match?.[2] as Severity) ?? defaultSeverity(name);
  return { name, severity };
}

function defaultSeverity(name: string): Severity {
  const definition = HINDRANCE_INDEX[name];
  return definition && definition.severity !== "either" ? definition.severity : "Minor";
}

/** Hindrance points earned, capped at the creation limit. */
export function hindrancePoints(hindrances: string[]): number {
  const total = hindrances.reduce(
    (sum, label) => sum + (parseHindrance(label).severity === "Major" ? 2 : 1),
    0,
  );
  return Math.min(CREATION.hindrancePointsMax, total);
}

/** Hindrance points earned before the cap (for the over-limit warning). */
export function hindrancePointsRaw(hindrances: string[]): number {
  return hindrances.reduce(
    (sum, label) => sum + (parseHindrance(label).severity === "Major" ? 2 : 1),
    0,
  );
}

// ── Edges ────────────────────────────────────────────────────

export interface EdgePrerequisites {
  attributes?: Partial<Record<AttributeName, number>>;
  skills?: Record<string, number>;
  /** Free-text requirement the guide shows but cannot check. */
  note?: string;
}

export interface EdgeDefinition {
  name: string;
  hint: string;
  /** Only the requirements the guide can verify are listed here. */
  prereqs?: EdgePrerequisites;
}

/** Curated catalogue: requirements are listed only where they are checkable. */
export const EDGES: EdgeDefinition[] = [
  { name: "Ambidextrous", hint: "Ignore the off-hand penalty." },
  { name: "Attractive", hint: "+1 to Performance and Persuasion, +2 against those who care.", prereqs: { attributes: { vigor: 6 } } },
  { name: "Brawny", hint: "+1 Toughness and a higher load limit.", prereqs: { attributes: { strength: 6, vigor: 6 } } },
  { name: "Brute", hint: "Size +1, +1 Toughness, stronger melee damage.", prereqs: { attributes: { strength: 6, vigor: 6 } } },
  { name: "Combat Reflexes", hint: "+2 to recover from Shaken." },
  { name: "Connections", hint: "Call in favours from an organisation." },
  { name: "Dodge", hint: "−2 to be hit by ranged attacks.", prereqs: { attributes: { agility: 8 }, skills: { Athletics: 6 } } },
  { name: "Elan", hint: "+2 when you spend a Benny to reroll.", prereqs: { attributes: { spirit: 8 } } },
  { name: "Fleet-Footed", hint: "Pace +2 and a better running die.", prereqs: { attributes: { agility: 6 } } },
  { name: "Great Luck", hint: "Two extra Bennies each session." },
  { name: "Hard to Kill", hint: "Ignore wound penalties when Incapacitated." },
  { name: "Improvisational Fighter", hint: "Ignore the improvised-weapon penalty.", prereqs: { attributes: { smarts: 6 } } },
  { name: "Iron Jaw", hint: "+2 to Soak rolls.", prereqs: { attributes: { vigor: 8 } } },
  { name: "Jack-of-All-Trades", hint: "Use any skill untrained at d4−2.", prereqs: { attributes: { smarts: 10 } } },
  { name: "Level Headed", hint: "Act on the better of two cards.", prereqs: { attributes: { smarts: 8 } } },
  { name: "Linguist", hint: "Know many languages.", prereqs: { attributes: { smarts: 6 } } },
  { name: "Luck", hint: "One extra Benny each session." },
  { name: "Marksman", hint: "Ignore up to −2 of ranged penalties when you do not move.", prereqs: { skills: { Athletics: 8 } } },
  { name: "Mighty Blow", hint: "+1d6 damage on a raise with a weapon.", prereqs: { skills: { Fighting: 8 } } },
  { name: "Quick", hint: "Redraw a low action card.", prereqs: { attributes: { agility: 8 } } },
  { name: "Rapid Recharge", hint: "Recover Power Points faster.", prereqs: { note: "An Arcane Background." } },
  { name: "Rock and Roll!", hint: "Ignore the full-auto penalty.", prereqs: { skills: { Shooting: 8 } } },
  { name: "Steady Hands", hint: "Ignore the unstable-platform penalty.", prereqs: { attributes: { agility: 8 } } },
  { name: "Strong Willed", hint: "+2 to resist Intimidation and Taunt.", prereqs: { attributes: { spirit: 8 } } },
  { name: "Trademark Weapon", hint: "+1 to attack with your signature weapon.", prereqs: { skills: { Fighting: 8 } } },
  { name: "Wizard", hint: "Powers cost one Power Point less.", prereqs: { note: "An Arcane Background." } },
  { name: "Woodsman", hint: "+2 to Survival, Stealth and tracking in the wild.", prereqs: { attributes: { spirit: 6 }, skills: { Survival: 8 } } },
];

export const EDGE_INDEX: Record<string, EdgeDefinition> = Object.fromEntries(
  EDGES.map((e) => [e.name, e]),
);

// ── State and validation ─────────────────────────────────────

export interface CreationState {
  attributes: Record<string, number>;
  skills: Record<string, number>;
  edges: string[];
  hindrances: string[];
}

export interface CreationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  attributePointsSpent: number;
  skillPointsSpent: number;
  hindrancePointsEarned: number;
  hindrancePointsSpent: number;
  freeEdges: number;
}

/**
 * Validate a starting character.
 *
 * Hindrance points are a pool: any overspend of the base budgets has to
 * be covered by points earned from Hindrances, at the official rates.
 */
export function validateCreation(state: CreationState): CreationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [attribute, step] of Object.entries(state.attributes)) {
    if (step < CREATION.baseAttribute || step > CREATION.maxStep) {
      errors.push(`${attribute} must be between d4 and d12 (got d${step}).`);
    }
    if (!STEP_LADDER.includes(step as (typeof STEP_LADDER)[number])) {
      errors.push(`${attribute} must use a die step of d4, d6, d8, d10 or d12.`);
    }
  }

  const attributeSpent = attributePointsSpent(state.attributes);
  const skillSpent = skillPointsSpent(state.skills, state.attributes);

  for (const [skill, step] of Object.entries(state.skills)) {
    if (!SKILL_INDEX[skill]) {
      warnings.push(`"${skill}" is not in the skill list; it was left unchecked.`);
      continue;
    }
    if (step > CREATION.maxStep) {
      errors.push(`${skill} cannot start above d12 (got d${step}).`);
    }
    if (!STEP_LADDER.includes(step as (typeof STEP_LADDER)[number])) {
      errors.push(`${skill} must use a die step of d4, d6, d8, d10 or d12.`);
    }
  }

  const earnedRaw = hindrancePointsRaw(state.hindrances);
  const earned = hindrancePoints(state.hindrances);
  if (earnedRaw > CREATION.hindrancePointsMax) {
    warnings.push(
      `You took ${earnedRaw} points of Hindrances; only ${CREATION.hindrancePointsMax} count at creation.`,
    );
  }

  const attributeOver = Math.max(0, attributeSpent - CREATION.attributePoints);
  const skillOver = Math.max(0, skillSpent - CREATION.skillPoints);
  const edgeOver = Math.max(0, state.edges.length - CREATION.freeEdges);
  const spent =
    attributeOver * HINDRANCE_SPEND.attributeStep +
    skillOver * HINDRANCE_SPEND.skillStep +
    edgeOver * HINDRANCE_SPEND.edge;

  if (attributeOver > 0 && earned < spent) {
    errors.push(
      `Attributes are ${attributeOver} point(s) over the 5 free points and the Hindrances taken do not cover it.`,
    );
  }
  if (skillOver > 0 && earned < spent) {
    errors.push(
      `Skills are ${skillOver} point(s) over the 12 free points and the Hindrances taken do not cover it.`,
    );
  }
  if (edgeOver > 0 && earned < spent) {
    errors.push(
      `You took ${state.edges.length} Edges; the first is free and each extra one costs 2 Hindrance points.`,
    );
  }
  if (spent > earned) {
    errors.push(
      `You spent ${spent} Hindrance point(s) but only earned ${earned}. Add Hindrances or reduce the sheet.`,
    );
  }

  for (const edge of state.edges) {
    const reason = edgeBlockReason(edge, state);
    if (reason) errors.push(reason);
  }

  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings,
    attributePointsSpent: attributeSpent,
    skillPointsSpent: skillSpent,
    hindrancePointsEarned: earned,
    hindrancePointsSpent: spent,
    freeEdges: CREATION.freeEdges,
  };
}

/** Why an Edge cannot be taken yet, or null when it can. */
export function edgeBlockReason(edge: string, state: CreationState): string | null {
  const definition = EDGE_INDEX[edge];
  if (!definition) return `"${edge}" is not in the Edge catalogue.`;
  const prereqs = definition.prereqs;
  if (!prereqs) return null;

  for (const [attribute, minimum] of Object.entries(prereqs.attributes ?? {})) {
    const step = state.attributes[attribute] ?? CREATION.baseAttribute;
    if (step < (minimum as number)) {
      return `${edge} needs ${attribute} d${minimum} (you have d${step}).`;
    }
  }
  for (const [skill, minimum] of Object.entries(prereqs.skills ?? {})) {
    const step = state.skills[skill] ?? 0;
    if (step < (minimum as number)) {
      return `${edge} needs ${skill} d${minimum} (you have ${step ? `d${step}` : "it untrained"}).`;
    }
  }
  return null;
}

// ── Guide helpers (used by the creator UI) ───────────────────

export interface OptionExplanation {
  allowed: boolean;
  cost: number;
  reason?: string;
}

/** Can the player set this attribute to `step`, and what would it cost? */
export function explainAttributeStep(
  attribute: string,
  step: number,
  state: CreationState,
): OptionExplanation {
  const current = state.attributes[attribute] ?? CREATION.baseAttribute;
  const nextAttributes = { ...state.attributes, [attribute]: step };
  const delta = Math.max(0, step - CREATION.baseAttribute) -
    Math.max(0, current - CREATION.baseAttribute);
  const spent = attributePointsSpent(nextAttributes);
  const over = Math.max(0, spent - CREATION.attributePoints);
  const skillOver = Math.max(
    0,
    skillPointsSpent(state.skills, nextAttributes) - CREATION.skillPoints,
  );
  const edgeOver = Math.max(0, state.edges.length - CREATION.freeEdges);
  const needed =
    over * HINDRANCE_SPEND.attributeStep +
    skillOver * HINDRANCE_SPEND.skillStep +
    edgeOver * HINDRANCE_SPEND.edge;
  const earned = hindrancePoints(state.hindrances);

  if (step > CREATION.maxStep) {
    return { allowed: false, cost: delta, reason: "d12 is the ceiling at creation." };
  }
  if (needed > earned) {
    return {
      allowed: false,
      cost: delta,
      reason: `${attribute} d${step} would need ${needed} Hindrance point(s) and you have ${earned}.`,
    };
  }
  return { allowed: true, cost: delta };
}

/** Can the player set this skill to `step`, and what would it cost? */
export function explainSkillStep(
  skill: string,
  step: number,
  state: CreationState,
): OptionExplanation {
  const info = SKILL_INDEX[skill];
  if (!info) return { allowed: false, cost: 0, reason: `Unknown skill "${skill}".` };

  const current = state.skills[skill] ?? 0;
  const cost = skillCost(skill, step, state.attributes);
  const currentCost = skillCost(skill, current, state.attributes);
  const delta = cost - currentCost;

  const nextSkills = { ...state.skills, [skill]: step };
  const spent = skillPointsSpent(nextSkills, state.attributes);
  const over = Math.max(0, spent - CREATION.skillPoints);
  const attributeOver = Math.max(
    0,
    attributePointsSpent(state.attributes) - CREATION.attributePoints,
  );
  const edgeOver = Math.max(0, state.edges.length - CREATION.freeEdges);
  const needed =
    over * HINDRANCE_SPEND.skillStep +
    attributeOver * HINDRANCE_SPEND.attributeStep +
    edgeOver * HINDRANCE_SPEND.edge;
  const earned = hindrancePoints(state.hindrances);
  const attribute = state.attributes[info.attribute] ?? CREATION.baseAttribute;

  if (step > CREATION.maxStep) {
    return { allowed: false, cost: delta, reason: "d12 is the ceiling at creation." };
  }
  if (needed > earned) {
    return {
      allowed: false,
      cost: delta,
      reason:
        `${skill} d${step} would put you at ${spent} of ${CREATION.skillPoints} skill points, ` +
        `needing ${needed} Hindrance point(s) and you have ${earned}.`,
    };
  }
  if (delta > 0 && step > attribute) {
    return {
      allowed: true,
      cost: delta,
      reason: `Above ${info.attribute} d${attribute}, so this step costs 2 points.`,
    };
  }
  return { allowed: true, cost: delta };
}

/** Can this Edge be taken, and what does it cost in Hindrance points? */
export function explainEdge(edge: string, state: CreationState): OptionExplanation {
  const taken = state.edges.includes(edge);
  const cost = taken ? 0 : state.edges.length >= CREATION.freeEdges ? HINDRANCE_SPEND.edge : 0;
  const reason = taken ? null : edgeBlockReason(edge, state);
  if (reason) return { allowed: false, cost, reason };
  if (!taken && cost > 0) {
    const attributeOver = Math.max(
      0,
      attributePointsSpent(state.attributes) - CREATION.attributePoints,
    );
    const skillOver = Math.max(
      0,
      skillPointsSpent(state.skills, state.attributes) - CREATION.skillPoints,
    );
    const spent =
      attributeOver * HINDRANCE_SPEND.attributeStep +
      skillOver * HINDRANCE_SPEND.skillStep +
      cost;
    if (spent > hindrancePoints(state.hindrances)) {
      return {
        allowed: false,
        cost,
        reason: `This Edge costs ${cost} Hindrance points and the sheet has already committed them.`,
      };
    }
    return { allowed: true, cost, reason: `Costs ${cost} Hindrance points.` };
  }
  return { allowed: true, cost };
}
