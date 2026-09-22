/**
 * Random NPC generator (Mythic-flavoured).
 *
 * Builds a usable scene character in one roll: name, occupation,
 * appearance, personality, what they want, what they hide, plus a
 * Mythic stance the cast tracker can store directly.
 *
 * Pure — used by the UI oracle panel, the tables API and the AI
 * GM's `generate_npc` tool.
 */
import { dN } from "../rules/dice";

export type NpcGenre = "fantasy" | "scifi" | "western" | "noir" | "horror" | "universal";

export interface GeneratedNpc {
  name: string;
  occupation: string;
  appearance: string;
  personality: string;
  /** What the NPC is after right now. */
  desire: string;
  /** What the NPC is hiding. */
  secret: string;
  /** Mythic stance for the cast tracker. */
  stance: "Neutral" | "Friendly" | "Hostile";
  /** Mannerism that sells the character at the table. */
  quirk: string;
}

// ── Name pools per genre ─────────────────────────────────────

const NAMES: Record<NpcGenre, string[]> = {
  fantasy: [
    "Aldric", "Branna", "Caelum", "Dara", "Edrin", "Faelan", "Gwenith", "Halric",
    "Isolde", "Joric", "Kessa", "Lorcan", "Mira", "Nessa", "Orin", "Perrin",
    "Quill", "Rowan", "Sable", "Tamsin", "Ulric", "Vesna", "Wren", "Yoric",
  ],
  scifi: [
    "Ada Voss", "Cass Meridian", "Dex Okonkwo", "Eli Sarraf", "Freya Lund",
    "Hux Tanaka", "Iria Sol", "Jax Verne", "Kira Nyx", "Lio Márquez",
    "Mav Ortega", "Nyx Calloway", "Oren Bly", "Pax Raman", "Qui Valez",
    "Rhea Sato", "Soren Vale", "Tavi Kwon", "Uma Reyes", "Vex Idris",
  ],
  western: [
    "Amos Barnett", "Belle Rourke", "Cade Hollister", "Della Vane", "Eb Pritchard",
    "Fiona Slade", "Gideon Marsh", "Hattie Cole", "Isaac Drummer", "Jesse Kwan",
    "Louelle Fray", "Milo Grange", "Nora Tate", "Obadiah Fisk", "Pearl Voss",
    "Quinn Harrow", "Silas Redd", "Tilda Banks", "Uriah Knox", "Vera Lomax",
  ],
  noir: [
    "Auggie Lux", "Billie Sharp", "Carmen Vale", "Dutch Kell", "Eddie Marlowe",
    "Fay Donnelly", "Gus Cardinal", "Helen Ward", "Iggy Pell", "June Ferris",
    "Kit Molloy", "Lenny Croft", "Mona Devereaux", "Nate Kilroy", "Olive Crane",
    "Pete Halloran", "Ruby Sinclair", "Sam Ortega", "Vera Doyle", "Wes Corbin",
  ],
  horror: [
    "Abel Wren", "Betha Morse", "Cyrus Blackwood", "Dolly Vance", "Ezra Crane",
    "Fern Holloway", "Gideon Slade", "Hester Vane", "Ivan Morley", "Junia Ash",
    "Kinda Rook", "Lucian Fenn", "Mara Dusk", "Niles Corvo", "Odell Frye",
    "Percival Grim", "Rhoda Ketch", "Silas Vole", "Tessa Morne", "Wilhel Cray",
  ],
  universal: [
    "Alex Quinn", "Bianca Ruiz", "Casey Lindqvist", "Dario Fenn", "Elena Marsh",
    "Felix Novak", "Gita Rao", "Hugo Berger", "Imani Okoye", "Jonas Vidal",
    "Kara Lindgren", "Luca Perrin", "Mina Farouk", "Nico Delgado", "Oona Byrne",
    "Pavel Antonov", "Rina Okafor", "Sami Haddad", "Tomas Vega", "Yara Bellini",
  ],
};

const OCCUPATIONS: Record<NpcGenre, string[]> = {
  fantasy: [
    "guild smith", "hedge mage", "caravan scout", "temple acolyte", "tavern keeper",
    "bounty hunter", "herbalist", "city gate guard", "relic hunter", "court spy",
    "beast handler", "map seller", "oathbound knight", "grave warden",
  ],
  scifi: [
    "salvage pilot", "station medic", "corporate analyst", "xeno-linguist",
    "cargo hauler", "drone technician", "security enforcer", "data broker",
    "colony engineer", "prospector", "ship AI custodian", "stowaway",
    "bounty courier", "reactor tech",
  ],
  western: [
    "rail surveyor", "stable hand", "preacher", "land speculator", "drifter",
    "telegraph operator", "deputy", "dentist", "cattle driver", "saloon pianist",
    "assayer", "schoolteacher", "bounty hunter", "stagecoach driver",
  ],
  noir: [
    "beat cop", "private eye", "journalist", "bookkeeper", "dock foreman",
    "night nurse", "cab driver", "fence", "district attorney", "torch singer",
    "armory clerk", "informant", "lab tech", "hotel clerk",
  ],
  horror: [
    "groundskeeper", "small-town sheriff", "antiquarian", "night watchman",
    "family lawyer", "undertaker", "motel owner", "paramedian", "archivist",
    "delivery driver", "hospice nurse", "private collector", "caretaker", "traveling preacher",
  ],
  universal: [
    "shop owner", "cab driver", "nurse", "teacher", "courier", "security guard",
    "journalist", "mechanic", "librarian", "cook", "accountant", "driver",
    "social worker", "line worker",
  ],
};

const APPEARANCE = [
  "wears a scar across one knuckle",
    "dresses one era out of step with everyone else",
    "has eyes that never stop scanning the room",
    "carries themselves like they're always late for something",
    "is impossibly clean given the surroundings",
    "has ink-stained fingers",
    "limps slightly on the left",
    "smells faintly of smoke and mint",
    "keeps their hood up",
    "smiles a beat too slowly",
    "has a memorable laugh that fills a room",
    "is short enough to be underestimated",
    "is tall enough to duck through doorways",
    "wears a keepsake locket they touch when thinking",
];

const PERSONALITY = [
    "courteous until crossed, then freezing",
    "loud, generous, and terrible at secrets",
    "quietly suspicious of everyone",
    "earnest to the point of naïveté",
    "dry wit masking real fear",
    "patient and methodical",
    "easily excited by ideas",
    "coldly transactional",
    "superstitious about small omens",
    "compulsively honest when it costs nothing",
    "deferential to authority, ruthless below it",
    "haunted by a single past failure",
    "playful, even in bad situations",
    "paranoid about being followed",
];

const DESIRES = [
    "to pay off a debt before it comes due",
    "to get out of town before nightfall",
    "to protect one specific person",
    "to buy back something that was sold",
    "to prove someone wrong",
    "to uncover who is lying",
    "to be left alone for one quiet week",
    "to fund a journey they can't explain",
    "to settle an old score quietly",
    "to be promoted past their rival",
    "to find a missing relative",
    "to smuggle something past a checkpoint",
    "to erase a record from an official ledger",
    "to save enough to retire from this life",
];

const SECRETS = [
    "is reporting to someone the party hasn't met",
    "stole the very thing they're helping search for",
    "owes money to a dangerous lender",
    "isn't who their papers say they are",
    "killed someone in self-defense, years ago",
    "has been reading the party's mail",
    "is sick and hiding the prognosis",
    "faked a competence they don't have",
    "is in love with someone on the other side",
    "smuggles goods through a hidden route",
    "knows where a body is buried",
    "is planning to leave town with the loot",
    "has a warrant out under another name",
    "shelters a fugitive in their home",
];

const QUIRKS = [
    "talks to inanimate objects when nervous",
    "never sits with their back to a door",
    "collects buttons",
    "quotes old laws from memory",
    "taps a coin against the table in threes",
    "answers questions with questions",
    "refuses to speak above a whisper indoors",
    "chants quietly before entering a room",
    "polishes the same coin over and over",
    "calls everyone by the wrong name on purpose",
    "flinches at sudden laughter",
    "always offers food before business",
    "keeps a worn photograph in one glove",
    "hums an off-key tune when lying",
];

function pick<T>(pool: T[]): T {
  return pool[dN(pool.length) - 1];
}

/** Stance: biased by genre horror (more hostile) — d6 distribution. */
function rollStance(): GeneratedNpc["stance"] {
  const roll = dN(6);
  if (roll <= 2) return "Hostile";
  if (roll <= 5) return "Neutral";
  return "Friendly";
}

/** Generate a complete NPC. Genre picks the name/occupation pools. */
export function generateNpc(genre: NpcGenre | string = "universal"): GeneratedNpc {
  const key = (genre in NAMES ? genre : "universal") as NpcGenre;
  return {
    name: pick(NAMES[key]),
    occupation: pick(OCCUPATIONS[key]),
    appearance: pick(APPEARANCE),
    personality: pick(PERSONALITY),
    desire: pick(DESIRES),
    secret: pick(SECRETS),
    stance: rollStance(),
    quirk: pick(QUIRKS),
  };
}

/** One-paragraph block the GM can drop straight into narration. */
export function formatNpc(npc: GeneratedNpc): string {
  return [
    `${npc.name}, ${npc.occupation}.`,
    `Appearance: ${npc.appearance}; ${npc.personality}.`,
    `Wants: ${npc.desire}. Hides: ${npc.secret}.`,
    `Mannerism: ${npc.quirk}.`,
  ].join(" ");
}
