/**
 * Built-in d100 tables — ready-to-play resources.
 *
 * Genre packs of random tables (encounters, complications, loot,
 * omens…) usable straight from the Oracle UI, the tables API and
 * the AI GM's `roll_table` tool. Users can author their own
 * tables on top of these (see `CustomTable` in the schema).
 *
 * Every table is a flat list of entries; a d100 roll maps to an
 * entry band (entries divide 100 evenly: 10/20/25/50 entries).
 */
import { dN } from "../rules/dice";

export interface TableMeta {
  id: string;
  name: string;
  genre: string;
  description: string;
  /** Number of entries (d100 bands). */
  size: number;
}

export interface BuiltinTable extends TableMeta {
  entries: string[];
}

// ── Fantasy ──────────────────────────────────────────────────

const FANTASY_ENCOUNTER = [
  "A wounded messenger begging for help",
  "Toll collectors who are not what they seem",
  "A shrine defiled — and still warm",
  "Mercenaries arguing over split loot",
  "A beast dragging something square and man-made",
  "Pilgrims singing the wrong hymn",
  "A merchant with a locked iron chest",
  "Two nobles dueling with real steel",
  "A child who knows the party's names",
  "Smoke on the horizon, no birdsong",
];

const FANTASY_COMPLICATION = [
  "A bridge has collapsed ahead",
  "The local lord has put a price on someone's head",
  "A key breaks in a lock",
  "Night falls an hour early",
  "A map turns out to be a forgery",
  "Guards are searching everyone on the road",
  "The healers' guild refuses service",
  "A trusted guide is drunk by noon",
  "A debt is called in, publicly",
  "Rain soaks every scroll and map",
];

const FANTASY_TREASURE = [
  "A chipped but potent rune stone",
  "Coins from a kingdom that no longer exists",
  "A letters-of-credit, payable in a distant city",
  "A map margin annotated in draconic",
  "Silver candlesticks worth more sentimentally",
  "A healing draught, one use",
  "A signet ring stolen from a tomb",
  "An undiscovered skill book",
  "A gemstone with a tiny face inside",
  "A warhorse's barding, fine make",
];

const FANTASY_LOCATION = [
  "A ruined watchtower with a intact stair",
  "A market under a collapsed arch",
  "A bog that echoes back your words",
  "Terraced vineyards worked by the blind",
  "A cathedral built around a meteor",
  "A rope bridge swaying over a dry gorge",
  "Standing stones arranged wrong",
  "A bathhouse still steaming after centuries",
  "An inn built into a giant's ribcage",
  "A library where books are chained",
];

const FANTASY_QUEST = [
  "Retrieve a stolen family blade",
  "Break a curse before the next moon",
  "Escort a witness to the capital",
  "Find who is poisoning the wells",
  "Recover a page torn from a living book",
  "Put a knight's ghost to rest",
  "Smuggle medicine past a blockade",
  "Expose a false heir",
  "Kill the thing the hunters won't name",
  "Deliver a letter never to be opened",
];

// ── Sci-fi ───────────────────────────────────────────────────

const SCIFI_ENCOUNTER = [
  "A salvage drone claiming salvage rights over you",
  "Refugees shuttling between derelicts",
  "A customs inspection with impossible paperwork",
  "A distress beacon looping the same three words",
  "Corporate安保 security scanning faces",
  "A chef running a restaurant in a cargo bay",
  "Two rivals meeting under a flag of truce",
  "A maintenance clone with a new hobby",
  "An unmarked ship matching your course",
  "Riot police blocking the mag-lev line",
];

const SCIFI_COMPLICATION = [
  "Life support reserves cut in half",
  "An airlock cycles without warning",
  "The uplink is being jammed",
  "Your credentials expire at midnight",
  "A recall order hits your equipment",
  "Gravity plating fails on decks 4–7",
  "A debt collector ships a legal bot aboard",
  "Comms are monitored and they know you heard",
  "Fuel is incompatible with local standards",
  "A stowaway triggers the manifest alarm",
];

const SCIFI_TREASURE = [
  "An unregistered med-gel kit",
  "A black-box flight recorder",
  "Prototype optics, military grade",
  "Untraceable cred-chips",
  "A seed vault from a dead colony",
  "A functioning AI wafer in a jar",
  "Rare-earth cores, weight in gold",
  "A lab sample on ice — do not shake",
  "An old star chart with a new star",
  "Salvage rights to a small moon",
];

const SCIFI_LOCATION = [
  "A rotating habitat's overgrown core",
  "A canyon of crashed orbital elevators",
  "A market built on a dam's spillway",
  "A cathedral-ship's engine room",
  "Frozen methane falls under neon signage",
  "A university arcology in permanent curfew",
  "Tunnels lit by bioluminescent cable",
  "A docking ring that hasn't spun in years",
  "A farm dome with someone else's crops",
  "The last analog telephone exchange",
];

const SCIFI_QUEST = [
  "Trace a signal that predates the colony",
  "Smuggle a person past a biometric gate",
  "Stop a reactor vent before dawn",
  "Prove which division faked the logs",
  "Recover a probe that came back wrong",
  "Protect a witness scheduled for mindwipe",
  "Decipher a language with no speakers left",
  "Win a race nobody is supposed to lose",
  "Shut down a war machine still following orders",
  "Deliver medicine to a quarantined ring",
];

// ── Western ──────────────────────────────────────────────────

const WESTERN_ENCOUNTER = [
  "A stagecoach with a broken axle",
  "Cowhands driving a herd across the trail",
  "A preacher burying someone alone",
  "Riders wearing the same red bandana",
  "A boy rehearsing a holdup on himself",
  "A widow boarding up a store",
  "A bear has found the supplies",
  "A duel scheduled for high noon",
  "An Indian agent selling bad maps",
  "A telegraph line cut in three places",
];

const WESTERN_COMPLICATION = [
  "A flash flood takes the ford",
  "The sheriff warns you to stay mounted and leave",
  "Your horse goes lame at dusk",
  "A claim jump is filed on your find",
  "The railroad survey arrives early",
  "A bounty posting with your description",
  "Dust storm: travel impossible until morning",
  "The saloon's price just doubled for strangers",
  "A witness recants — for a price",
  "Winter comes a month early",
];

const WESTERN_TREASURE = [
  "A deed nobody has filed yet",
  "Silver still marked with the assay stamp",
  "A cavalry revolver in perfect condition",
  "A chest of Mexican gold coins",
  "A survey map with a river that moved",
  "An untouched bottle of pre-war whiskey",
  "A pardon signed by a governor",
  "A stray railroad bond",
  "A prospector's last three samples",
  "A photograph worth more than the ranch",
];

const WESTERN_LOCATION = [
  "A ghost town with one lamp lit",
  "A canyon that echoes twice",
  "A church repurposed as a stable",
  "A hanging tree with fresh rope",
  "A hot spring behind a collapsed mine",
  "A switchback road no map shows",
  "A dry lakebed with something metallic",
  "A half-built railway bridge",
  "A schoolhouse with the register still open",
  "An abandoned Army fort, flag still flying",
];

const WESTERN_QUEST = [
  "Bring in a bounty alive",
  "Find who is burning the graze land",
  "Protect a homestead through one hard week",
  "Recover a herd driven across the border",
  "Prove a hanging was murder",
  "Deliver a ballot box unopened",
  "Find water before the herd dies",
  "Stop the sale of stolen rifles",
  "Ride for the telegraph before the storm",
  "Track the man who took the stagecoach's strongbox",
];

// ── Horror ───────────────────────────────────────────────────

const HORROR_ENCOUNTER = [
  "A dog that won't stop facing the dark",
  "Neighbors who all recall the same missing day",
  "A phone ringing in an empty house",
  "Someone standing at the treeline, unmoving",
  "A child's birthday party with no children",
  "All the clocks stopped at the same minute",
  "A mirror that lags half a second",
  "Wet footprints ending at a dry wall",
  "A room warm with breathing",
  "A stranger who knows the ending",
];

const HORROR_ATMOSPHERE = [
  "The air tastes like copper",
  "Every dog in town is silent",
  "Frost on the inside of the windows",
  "A hum you feel in your teeth",
  "Shadows lean the wrong way",
  "The hallway is longer than the house",
  "Photographs have turned to face the wall",
  "The smell of flowers at a graveside",
  "Whispered counting, just under hearing",
  "The lights dim when nobody speaks",
];

const HORROR_OMEN = [
  "A crow lands on the lintel and stays",
  "A mirror cracks without being touched",
  "The same name written in dust thrice",
  "A child draws the same figure again",
  "Milk sours within the hour",
  "A candle burns blue once",
  "Someone knocks three times, then silence",
  "The family Bible opens to Job",
  "A photograph develops a new figure",
  "Wind from a closed room",
];

const HORROR_LOCATION = [
  "An orchard planted in perfect rows around a well",
  "A hotel with one room always occupied",
  "A chapel sunk to its windows",
  "The old mill, boards nailed from the outside",
  "A sanatorium's Ward C, still furnished",
  "A crossroads with three markers, no names",
  "A house whose windows are all painted black",
  "The tide-pool where the divers found it",
  "A nursery with the mobile still turning",
  "A field of grass that never grows back",
];

const HORROR_QUEST = [
  "Learn the name it hates",
  "Burn what should not have been dug up",
  "Keep the vigil until dawn",
  "Find who invited it in",
  "Close the door before the last candle dies",
  "Get the children out without screaming",
  "Return the bones to their place",
  "Stop the ritual mid-sentence",
  "Find the seventh bell and ring it",
  "Read the last page aloud, exactly once",
];

// ── Noir / modern ────────────────────────────────────────────

const NOIR_CLUE = [
  "A matchbook from a club that burned down",
  "Wet tire tracks that stop halfway",
  "A ledger page with one name scraped off",
  "A receipt dated three days in the future",
  "Cigarette ash in an ashtray, brand nobody smokes",
  "A hotel key with no room number",
  "A photograph with a corner cut out",
  "A phone number with the prefix disconnected",
  "Mud on the carpet from a place with no mud",
  "A signature that doesn't match the will",
];

const NOIR_COMPLICATION = [
  "The only witness recants by morning",
  "Your client stops answering",
  "The case file has been checked out — permanently",
  "A patrol car starts following you",
  "Your apartment has been turned over",
  "The coroner's report contradicts the scene",
  "Someone posts bail you didn't know existed",
  "A photograph puts you at the scene",
  "The phone rings; nobody speaks",
  "Your bank account is suddenly interesting",
];

const NOIR_SUSPECT = [
  "The accountant who kept two sets of books",
  "The bodyguard who heard everything",
  "The widow with a new coat",
  "The doorman who wasn't on shift",
  "The brother with the gambling debts",
  "The rival who publicly wished him gone",
  "The gardener who saw too much",
  "The lawyer who drafted the second will",
  "The cab driver who took the long way",
  "The cop on the take, everyone knows",
];

const NOIR_LOCATION = [
  "A warehouse district after the whistle",
  "A jazz club's back stair",
  "A rooftop with a view of two alleys",
  "A morgue with a burned-out bulb",
  "A hotel lobby that never quite closes",
  "A parking structure level with no cameras",
  "A newspaper's night desk",
  "A church confessional repurposed as an office",
  "A ferry landing in fog",
  "A diner where the night shift talks",
];

const NOIR_QUEST = [
  "Find who paid the hit",
  "Clear a name before the morning edition",
  "Recover a ledger before the DA does",
  "Follow the money to the second floor",
  "Prove the suicide note was written twice",
  "Get the girl out of the city",
  "Expose the precinct's quiet arrangement",
  "Return the jewels without explaining them",
  "Find the man who signed as a witness",
  "Keep one story out of print until Monday",
];

// ── Universal ────────────────────────────────────────────────

const WEATHER = [
  "Clear, cold, and windless",
  "A slow drizzle that soaks through",
  "Low fog that swallows sound",
  "Thunderheads building to the west",
  "A dry, dust-kicking wind",
  "Snow beginning, thick and silent",
  "Overcast and mild, no shadow",
  "A hard rain lasting an hour, then sun",
  "Heat shimmer by mid-morning",
  "Ice on every surface by dawn",
];

const COMPLICATION_UNIVERSAL = [
  "Something you needed is gone",
  "A shortcut turns out to be longer",
  "You're overheard at the wrong moment",
  "An old injury acts up",
  "A door you counted on is locked",
  "Someone recognizes you — and smiles",
  "The plan assumes a map that's outdated",
  "A small fire demands immediate attention",
  "You are asked for identification",
  "A friend's advice proves expensive",
];

// ── Registry ─────────────────────────────────────────────────

function table(
  id: string,
  name: string,
  genre: string,
  description: string,
  entries: string[],
): BuiltinTable {
  return { id, name, genre, description, entries, size: entries.length };
}

export const BUILTIN_TABLES: BuiltinTable[] = [
  table("fantasy-encounter", "Encounter", "fantasy", "Who or what crosses your path.", FANTASY_ENCOUNTER),
  table("fantasy-complication", "Complication", "fantasy", "What goes wrong right now.", FANTASY_COMPLICATION),
  table("fantasy-treasure", "Treasure", "fantasy", "What's worth taking.", FANTASY_TREASURE),
  table("fantasy-location", "Location", "fantasy", "Where the scene takes place.", FANTASY_LOCATION),
  table("fantasy-quest", "Quest hook", "fantasy", "A job waiting to be taken.", FANTASY_QUEST),
  table("scifi-encounter", "Encounter", "scifi", "Who or what crosses your path.", SCIFI_ENCOUNTER),
  table("scifi-complication", "Complication", "scifi", "What goes wrong right now.", SCIFI_COMPLICATION),
  table("scifi-treasure", "Salvage", "scifi", "What's worth taking.", SCIFI_TREASURE),
  table("scifi-location", "Location", "scifi", "Where the scene takes place.", SCIFI_LOCATION),
  table("scifi-quest", "Job", "scifi", "A contract waiting to be taken.", SCIFI_QUEST),
  table("western-encounter", "Encounter", "western", "Who or what rides in.", WESTERN_ENCOUNTER),
  table("western-complication", "Complication", "western", "What goes wrong right now.", WESTERN_COMPLICATION),
  table("western-treasure", "Stake", "western", "What's worth taking.", WESTERN_TREASURE),
  table("western-location", "Location", "western", "Where the scene takes place.", WESTERN_LOCATION),
  table("western-quest", "Job", "western", "A ridin' job waiting.", WESTERN_QUEST),
  table("horror-encounter", "Encounter", "horror", "What you find — or finds you.", HORROR_ENCOUNTER),
  table("horror-atmosphere", "Atmosphere", "horror", "The texture of dread in the scene.", HORROR_ATMOSPHERE),
  table("horror-omen", "Omen", "horror", "A warning nobody heeds.", HORROR_OMEN),
  table("horror-location", "Location", "horror", "Where it happens.", HORROR_LOCATION),
  table("horror-quest", "Ritual", "horror", "What must be done before dawn.", HORROR_QUEST),
  table("noir-clue", "Clue", "noir", "The detail that moves the case.", NOIR_CLUE),
  table("noir-complication", "Complication", "noir", "What closes in.", NOIR_COMPLICATION),
  table("noir-suspect", "Suspect", "noir", "Everyone had a reason.", NOIR_SUSPECT),
  table("noir-location", "Location", "noir", "Where the shadow falls.", NOIR_LOCATION),
  table("noir-quest", "Case", "noir", "A client with a problem.", NOIR_QUEST),
  table("universal-weather", "Weather", "universal", "Set the sky.", WEATHER),
  table("universal-complication", "Complication", "universal", "Genre-agnostic friction.", COMPLICATION_UNIVERSAL),
];

/** Genres present in the registry. */
export const TABLE_GENRES = Array.from(new Set(BUILTIN_TABLES.map((t) => t.genre)));

/** List table metadata (optionally filtered by genre). */
export function listTables(genre?: string): TableMeta[] {
  const { entries: _drop, ...meta } = BUILTIN_TABLES[0];
  void _drop;
  const all = BUILTIN_TABLES.map((t) => ({
    id: t.id,
    name: t.name,
    genre: t.genre,
    description: t.description,
    size: t.size,
  }));
  return genre ? all.filter((t) => t.genre === genre) : all;
}

/** Find a built-in table by id. */
export function getTable(id: string): BuiltinTable | undefined {
  return BUILTIN_TABLES.find((t) => t.id === id);
}

/** Result of any d100 table roll. */
export interface TableRoll {
  /** Table rolled (id when built-in, "custom" for user tables). */
  tableId: string;
  tableName: string;
  /** 1–100 percentile roll. */
  roll: number;
  /** 0-based band index. */
  index: number;
  /** The winning entry text. */
  text: string;
}

/**
 * Roll on any entry list (built-in or user-authored). Pass `roll`
 * to force a percentile (default: random d100).
 */
export function rollOnEntries(
  tableId: string,
  tableName: string,
  entries: string[],
  roll?: number,
): TableRoll {
  if (entries.length === 0) throw new Error(`Table "${tableName}" has no entries`);
  const r = Math.min(100, Math.max(1, roll ?? dN(100)));
  const band = 100 / entries.length;
  const index = Math.min(entries.length - 1, Math.floor((r - 1) / band));
  return { tableId, tableName, roll: r, index, text: entries[index] };
}

/** Roll on a built-in table by id. */
export function rollOnTable(id: string, roll?: number): TableRoll {
  const t = getTable(id);
  if (!t) throw new Error(`Unknown table: ${id}`);
  return rollOnEntries(t.id, `${t.genre}: ${t.name}`, t.entries, roll);
}
