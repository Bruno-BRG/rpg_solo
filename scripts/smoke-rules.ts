/**
 * Smoke test — rules & oracle engines (pure, no database).
 *
 * Run: npx tsx scripts/smoke-rules.ts
 *
 * Asserts statistical behaviour (aces, fate-chart odds, table
 * coverage) and the deterministic parts of every new subsystem:
 * combat, dramatic tasks, interludes, progression, tables, NPCs.
 */
import { rollTrait, rollDie, rollPlain } from "../src/lib/rules/dice";
import { askFateChart, fateOdds, fateThreshold, LIKELIHOODS } from "../src/lib/oracle/fate-chart";
import { setupScene, randomEvent, detailAction, detailSubject, rollCustomTable } from "../src/lib/oracle/random-events";
import {
  rollInitiative, attackRoll, damageRoll, soakRoll, unshakeRoll, summarizeDamage,
  createActionDeck, cardScore, dealRound, distanceSquares, isAdjacent, lineOfSight,
  coverPenalty, reachableCells, pathCost, rangeBand, attackModifiers, gangUpBonus,
  multiActionPenalty, movementAllowance, woundPenalty,
} from "../src/lib/rules/combat";
import {
  CREATION, EDGES, HINDRANCES, SKILLS, skillCost, attributePointsSpent,
  skillPointsSpent, hindrancePoints, hindranceLabel, parseHindrance,
  validateCreation, explainAttributeStep, explainSkillStep, explainEdge,
  edgeBlockReason,
} from "../src/lib/rules/creation";
import { deriveStats } from "../src/lib/rules/derived";
import {
  createDramaticTask, applyTaskRoll, advanceTaskRound, taskProgress, tokensForRoll,
} from "../src/lib/rules/dramatic-tasks";
import { runInterlude, interludeOutlook } from "../src/lib/rules/interludes";
import { progress, awardXp, XP_PER_ADVANCE } from "../src/lib/rules/progression";
import { BUILTIN_TABLES, listTables, getTable, rollOnTable, rollOnEntries, TABLE_GENRES } from "../src/lib/oracle/tables";
import { generateNpc, formatNpc, type NpcGenre } from "../src/lib/oracle/npc";
import {
  buildCampaignDigest,
  normalizeFactText,
  SECTION_BUDGETS,
} from "../src/lib/gm/knowledge";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures++;
    console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function rate(fn: () => boolean, n = 4000): number {
  let hits = 0;
  for (let i = 0; i < n; i++) if (fn()) hits++;
  return hits / n;
}

// ── Dice ─────────────────────────────────────────────────────
console.log("\n[1] Savage Worlds dice");
{
  const d8 = rate(() => rollTrait(8, 4).success);           // expected ≈ 0.81
  check("d8 vs 4 success rate ~81%", d8 > 0.74 && d8 < 0.88, `${(d8 * 100).toFixed(1)}%`);

  const wild = rate(() => rollTrait(4, 4).success);          // wild die lifts d4
  check("wild die helps d4 vs 4", wild > 0.45, `${(wild * 100).toFixed(1)}%`);

  const crit = rate(() => rollTrait(6, 4).criticalFailure);  // ≈ 1/36
  check("critical failure ~2.8%", crit > 0.01 && crit < 0.05, `${(crit * 100).toFixed(1)}%`);

  let aces = 0;
  for (let i = 0; i < 3000; i++) if (rollDie(6).rolls.length > 1) aces++;
  check("d6 acing rate ~16.7%", aces / 3000 > 0.10 && aces / 3000 < 0.23, `${((aces / 3000) * 100).toFixed(1)}%`);

  const both = rollPlain(6, 2);
  check("rollPlain returns dice", both.length === 2 && both.every((v) => v >= 1 && v <= 600)); // acing can exceed one die's max
}

// ── Fate chart ───────────────────────────────────────────────
console.log("\n[2] Mythic fate chart");
{
  const y50 = rate(() => askFateChart("q", "50/50", 5).answer.includes("Yes"));
  check("50/50 at chaos 5 ≈ 50%", y50 > 0.42 && y50 < 0.58, `${(y50 * 100).toFixed(1)}%`);

  const yHigh = rate(() => askFateChart("q", "50/50", 9).answer.includes("Yes"));
  check("chaos 9 favors Yes", yHigh > y50 + 0.1, `${(yHigh * 100).toFixed(1)}%`);

  const yLow = rate(() => askFateChart("q", "50/50", 1).answer.includes("Yes"));
  check("chaos 1 favors No", yLow < y50 - 0.1, `${(yLow * 100).toFixed(1)}%`);

  for (const l of LIKELIHOODS) {
    const odds = fateOdds(l, 5);
    const expected = { "Almost Impossible": 5, "Very Unlikely": 11, "Unlikely": 26, "50/50": 50, "Likely": 75, "Very Likely": 90, "Almost Certain": 95 }[l];
    if (odds !== expected) { check(`odds table (${l})`, false, `${odds} ≠ ${expected}`); }
  }
  check("odds table matches published thresholds", fateOdds("50/50", 5) === 50 && fateOdds("Likely", 5) === 75);
  check("threshold helper clamps chaos", fateThreshold("50/50", 9) === 31, `t=${fateThreshold("50/50", 9)}`);

  const dbl = rate(() => askFateChart("q", "50/50", 5).randomEvent, 8000);
  check("random events trigger on doubles", dbl > 0.02 && dbl < 0.20, `${(dbl * 100).toFixed(1)}%`);
}

// ── Mythic scenes / events / details ────────────────────────
console.log("\n[3] Mythic scenes, events, details");
{
  const kinds = new Set(Array.from({ length: 200 }, () => setupScene(5).type));
  check("scene setup produces Set/Altered/Interrupt", kinds.has("Set"), Array.from(kinds).join(","));

  const ev = randomEvent();
  check("random event has focus/action/subject", !!ev.focus && !!ev.action && !!ev.subject, ev.description);
  check("action words come from 100-entry table", detailAction().word.length > 0);
  check("subject words come from 100-entry table", detailSubject().word.length > 0);

  const t = rollCustomTable(["alpha", "beta", "gamma"]);
  check("custom table roll picks an entry", ["alpha", "beta", "gamma"].includes(t));
}

// ── Combat ───────────────────────────────────────────────────
console.log("\n[4] Combat (initiative, attack, damage, soak, unshake)");
{
  const order = rollInitiative([
    { name: "Kael", actor: "wildcard" },
    { name: "Thug 1" },
    { name: "Thug 2" },
    { name: "Thug 3" },
  ]);
  const scores = order.map((o) => o.score);
  check("initiative sorted desc", scores.every((s, i) => i === 0 || scores[i - 1] >= s), scores.join(","));
  check("initiative has unique scores", new Set(scores).size === scores.length, scores.join(","));
  check("initiative keeps all combatants", order.length === 4);
  check("every combatant gets a card", order.every((o) => !!o.card && !!o.card.label));

  const deck = createActionDeck();
  check("action deck has 54 cards", deck.length === 54, String(deck.length));
  check("deck has two jokers", deck.filter((c) => c.joker).length === 2);
  check("deck covers 13 ranks in 4 suits", new Set(deck.filter((c) => !c.joker).map((c) => c.rank)).size === 13 &&
    new Set(deck.filter((c) => !c.joker).map((c) => c.suit)).size === 4);
  check("ace beats king", cardScore({ rank: "A", suit: "Clubs", joker: false, label: "A♣" }) >
    cardScore({ rank: "K", suit: "Spades", joker: false, label: "K♠" }));
  check("spades break a rank tie", cardScore({ rank: "9", suit: "Spades", joker: false, label: "9♠" }) >
    cardScore({ rank: "9", suit: "Clubs", joker: false, label: "9♣" }));
  check("a joker beats an ace", cardScore({ rank: "Joker", suit: "Joker", joker: true, label: "Joker" }) >
    cardScore({ rank: "A", suit: "Spades", joker: false, label: "A♠" }));

  // A rigged deck: joker first, then descending cards.
  const rigged = [
    { rank: "Joker", suit: "Joker", joker: true, label: "Joker" },
    { rank: "K", suit: "Spades", joker: false, label: "K♠" },
    { rank: "5", suit: "Clubs", joker: false, label: "5♣" },
  ] as const;
  const dealt = dealRound([{ name: "Kael" }, { name: "Thug" }, { name: "Mook" }], [...rigged]);
  check("joker acts first", dealt.order[0].joker && dealt.order[0].name === "Kael");
  check("joker is flagged for reshuffle", dealt.jokerDealt && dealt.reshuffled);
  check("deck is reshuffled after a joker", dealt.deck.length === 54);

  const noJoker = dealRound([{ name: "A" }, { name: "B" }], [
    { rank: "10", suit: "Hearts", joker: false, label: "10♥" },
    { rank: "3", suit: "Clubs", joker: false, label: "3♣" },
  ]);
  check("deck is kept when no joker appears", noJoker.deck.length === 0 && !noJoker.reshuffled);
  check("highest card acts first", noJoker.order[0].name === "A");

  const tooFew = dealRound([{ name: "A" }, { name: "B" }, { name: "C" }], [rigged[1]]);
  check("a short deck is reshuffled automatically", tooFew.order.length === 3 && tooFew.deck.length === 51);

  // d6 vs Parry 6 needs a natural 6; the wild die lifts it to ~31%.
  const hitRate = rate(() => attackRoll(6, 6).hit, 6000);
  check("d6 attack vs Parry 6 ≈ 31%", hitRate > 0.24 && hitRate < 0.40, `${(hitRate * 100).toFixed(1)}%`);

  const reachRate = rate(() => attackRoll(8, 6).hit, 6000);
  check("d8 attack vs Parry 6 ≈ 48%", reachRate > 0.40 && reachRate < 0.58, `${(reachRate * 100).toFixed(1)}%`);

  const raise = attackRoll(12, 4, 20); // guaranteed raise
  check("raise grants bonus damage die", raise.bonusDamageDie && raise.raises >= 1);

  const miss = attackRoll(3, 12, -10); // guaranteed miss
  check("penalized attack can miss", !miss.hit && !miss.bonusDamageDie);

  // Deterministic-ish damage bounds: d6 vs Toughness 4 (total ≥ 4 when die ≥ 4).
  let shakenCount = 0, woundCount = 0;
  for (let i = 0; i < 3000; i++) {
    const d = damageRoll(6, 0, 4);
    if (d.shaken) shakenCount++;
    if (d.wounds > 0) woundCount++;
  }
  check("d6 damage shakes often enough", shakenCount / 3000 > 0.40, `${((shakenCount / 3000) * 100).toFixed(1)}%`);
  check("d6 damage rarely wounds", woundCount / 3000 < 0.30, `${((woundCount / 3000) * 100).toFixed(1)}%`);

  const big = damageRoll(12, 2, 4); // high roll pressure with bonus dice
  check("damage result carries dice + total", big.weaponRolls.length === 1 && big.bonusRolls.length === 2 && big.total > 0);

  const extraKill = damageRoll(100, 0, 4, { isExtra: true }); // guaranteed overkill
  check("extras are taken out on a raise over Toughness", extraKill.incapacitated && extraKill.wounds >= 1);

  const soak = soakRoll(8, 50); // guaranteed raises
  check(
    "soak prevents a wound per success and raise",
    soak.woundsHealed === 1 + soak.roll.raises && soak.unshaken,
    `healed ${soak.woundsHealed} of ${soak.roll.raises} raise(s)`,
  );
  const bigSoak = soakRoll(8, 50, 4);
  check("a partial soak leaves Shaken", !bigSoak.unshaken || bigSoak.woundsHealed >= 4, `healed ${bigSoak.woundsHealed}`);
  const failedSoak = soakRoll(4, -10, 2);
  check("a failed soak prevents nothing", failedSoak.woundsHealed === 0 && !failedSoak.unshaken);

  const unshake = unshakeRoll(6, -50); // guaranteed failure
  check("unshake can fail", !unshake.unshaken);

  const summary = summarizeDamage(damageRoll(6, 0, 40));
  check("damage summary is human-readable", summary.includes("Toughness 40"), summary);
}

// ── Dramatic tasks ───────────────────────────────────────────
console.log("\n[5] Dramatic tasks");
{
  const task = createDramaticTask({ name: "Defuse the charge", skills: ["Notice", "Thievery"], requiredSuccesses: 5, timeLimit: 2 });
  check("defaults applied", task.targetNumber === 4 && task.status === "running");

  check("tokens: failure = 0", tokensForRoll(rollTrait(4, 4, -100)) === 0);
  check("tokens: crit failure = −1", tokensForRoll({ ...rollTrait(4, 4), success: false, criticalFailure: true, raises: 0 }) === -1);

  // Force results: success with raises → 1 + raises tokens.
  let t = applyTaskRoll(task, "Thievery", { ...rollTrait(6, 4), success: true, raises: 2, criticalFailure: false });
  check("raise tokens banked", t.successes === 3, `successes=${t.successes}`);

  t = applyTaskRoll(t, "Notice", { ...rollTrait(6, 4), success: true, raises: 2, criticalFailure: false });
  check("task completes at threshold", t.status === "completed" && t.successes >= 5, `${t.successes} tokens, ${taskProgress(t).percent}%`);

  let t2 = createDramaticTask({ name: "Reroute power", skills: ["Electronics"], timeLimit: 1 });
  t2 = advanceTaskRound(t2);
  check("task fails when time runs out", t2.status === "failed");

  let t3 = createDramaticTask({ name: "Wrong skill", skills: ["Driving"] });
  let threw = false;
  try { applyTaskRoll(t3, "Persuasion", rollTrait(6, 4)); } catch { threw = true; }
  check("off-list skill rejected", threw);
}

// ── Interludes ───────────────────────────────────────────────
console.log("\n[6] Interludes");
{
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const it = runInterlude();
    seen.add(it.question);
    if (!it.question.endsWith("?")) { check("question ends with ?", false, it.question); break; }
  }
  check("generates varied questions", seen.size > 10, `${seen.size} distinct`);
  check("interlude awards a benny", runInterlude().bennyAwarded === true);

  const outlook = interludeOutlook(6);
  check("outlook returns roll + chaos delta", typeof outlook.chaosDelta === "number" && [-1, 0, 1].includes(outlook.chaosDelta), `Δ=${outlook.chaosDelta}`);
}

// ── Progression ──────────────────────────────────────────────
console.log("\n[7] Progression (XP → advances → rank)");
{
  check("0 XP → Novice", progress(0).rank === "Novice" && progress(0).advances === 0);
  check(`${XP_PER_ADVANCE} XP → 1 advance`, progress(5).advances === 1);
  check("20 XP → 4 advances → Seasoned", progress(20).rank === "Seasoned", progress(20).rank);
  check("40 XP → 8 advances → Veteran", progress(40).rank === "Veteran", progress(40).rank);
  check("60 XP → 12 advances → Heroic", progress(60).rank === "Heroic", progress(60).rank);
  check("80 XP → 16 advances → Legendary", progress(80).rank === "Legendary" && progress(80).advancesToNextRank === null, progress(80).rank);
  check("progress to next advance", progress(7).xpToNextAdvance === 2 && progress(7).advanceProgress === 0.4);
  check("awardXp clamps at zero", awardXp(0, -5) === 0 && awardXp(1, 2) === 3);
}

// ── Tables ───────────────────────────────────────────────────
console.log("\n[8] Built-in d100 tables");
{
  check("ships ≥ 25 tables", BUILTIN_TABLES.length >= 25, `${BUILTIN_TABLES.length} tables`);
  check("genre packs present", ["fantasy", "scifi", "western", "horror", "noir", "universal"].every((g) => TABLE_GENRES.includes(g)), TABLE_GENRES.join(","));
  check("every table divides 100", BUILTIN_TABLES.every((t) => 100 % t.size === 0), BUILTIN_TABLES.map((t) => t.size).join(","));
  check("listTables exposes metadata", listTables().length === BUILTIN_TABLES.length && listTables("fantasy").length === 5);

  const roll = rollOnTable("horror-omen");
  check("rollOnTable returns band", roll.roll >= 1 && roll.roll <= 100 && roll.text.length > 0, `d100=${roll.roll} → ${roll.text}`);
  const forced = rollOnTable("fantasy-encounter", 1);
  check("forced roll 1 = first entry", forced.index === 0, forced.text);
  const forcedLast = rollOnEntries("x", "x", ["a", "b"], 100);
  check("forced roll 100 = last band", forcedLast.index === 1);

  const coverage = new Set(Array.from({ length: 500 }, () => rollOnTable("universal-weather").index));
  check("table rolls cover all bands", coverage.size === 10, `${coverage.size}/10 bands`);

  let unknown = false;
  try { rollOnTable("nope"); } catch { unknown = true; }
  check("unknown table throws", unknown);
}

// ── NPCs ─────────────────────────────────────────────────────
console.log("\n[9] NPC generator");
{
  const genres: NpcGenre[] = ["fantasy", "scifi", "western", "noir", "horror", "universal"];
  const names = new Set<string>();
  for (const g of genres) {
    for (let i = 0; i < 20; i++) {
      const npc = generateNpc(g);
      if (!npc.name || !npc.desire || !npc.secret || !npc.quirk) { check(`npc complete (${g})`, false); break; }
      if (g === "fantasy") names.add(npc.name);
    }
  }
  check("all genres generate", true);
  check("name variety per genre", names.size > 5, `${names.size} distinct names`);
  check("stance is Mythic-valid", ["Neutral", "Friendly", "Hostile"].includes(generateNpc().stance));

  const hostile = (() => { let h = 0; for (let i = 0; i < 600; i++) if (generateNpc().stance === "Hostile") h++; return h / 600; })();
  check("stance distribution sane", hostile > 0.15 && hostile < 0.55, `${(hostile * 100).toFixed(0)}% hostile`);

  check("formatNpc is narration-ready", formatNpc(generateNpc("western")).includes("Wants:"));
}

// ── Character creation ───────────────────────────────────────
console.log("\n[11] Character creation");
{
  const base = { agility: 4, smarts: 4, spirit: 4, strength: 4, vigor: 4 };

  check("core skills are free at d4", skillCost("Notice", 4, base) === 0);
  check("a new skill at d4 costs 1", skillCost("Fighting", 4, base) === 1);
  check(
    "steps at or below the attribute cost 1",
    skillCost("Fighting", 6, { ...base, agility: 6 }) === 2,
    String(skillCost("Fighting", 6, { ...base, agility: 6 })),
  );
  check(
    "a step above a d4 attribute costs 2",
    skillCost("Fighting", 6, base) === 3,
    String(skillCost("Fighting", 6, base)),
  );
  check(
    "steps above the attribute cost 2",
    skillCost("Shooting", 8, { ...base, agility: 6 }) === 4,
    String(skillCost("Shooting", 8, { ...base, agility: 6 })),
  );

  check("attribute points count steps above d4", attributePointsSpent({ ...base, vigor: 8 }) === 4);
  check(
    "skill points add up across the sheet",
    skillPointsSpent({ Fighting: 6, Shooting: 8 }, { ...base, agility: 6 }) === 6,
  );

  check("hindrances are worth 1 or 2 points", hindrancePoints([hindranceLabel("Mean", "Minor"), hindranceLabel("Arrogant", "Major")]) === 3);
  check("hindrance points cap at 4", hindrancePoints(["Arrogant (Major)", "Heroic (Major)", "Mean (Minor)"]) === 4);
  check("a stored label round-trips", parseHindrance("Greedy (Major)").severity === "Major" && parseHindrance("Mean").name === "Mean");
  check("the catalogue has skills, edges and hindrances", SKILLS.length >= 25 && EDGES.length >= 20 && HINDRANCES.length >= 30);

  const legal = validateCreation({
    attributes: { ...base, agility: 6, vigor: 6 },
    skills: { Fighting: 6, Shooting: 8, Notice: 4 },
    edges: ["Luck"],
    hindrances: [],
  });
  check("a legal sheet passes", legal.valid, legal.errors.join(" | "));

  const greedy = validateCreation({
    attributes: { ...base, agility: 10, smarts: 8, spirit: 8, vigor: 8, strength: 6 },
    skills: {},
    edges: [],
    hindrances: [],
  });
  check("overspending attributes is refused", !greedy.valid && greedy.errors.some((e) => e.includes("Attributes")), greedy.errors[0] ?? "");

  const skillGreedy = validateCreation({
    attributes: base,
    skills: { Fighting: 12, Shooting: 12, Athletics: 12 },
    edges: [],
    hindrances: [],
  });
  check("overspending skills is refused", !skillGreedy.valid, skillGreedy.errors[0] ?? "");

  const edgeGreedy = validateCreation({
    attributes: base,
    skills: {},
    edges: ["Luck", "Great Luck"],
    hindrances: [],
  });
  check("a second edge needs hindrance points", !edgeGreedy.valid, edgeGreedy.errors[0] ?? "");

  const paidFor = validateCreation({
    attributes: { ...base, vigor: 8 },
    skills: {},
    edges: ["Luck"],
    hindrances: ["Arrogant (Major)", "Heroic (Major)"],
  });
  check("hindrance points can pay for extra attributes", paidFor.valid, paidFor.errors.join(" | "));

  const tooHigh = validateCreation({ attributes: { ...base, vigor: 14 }, skills: {}, edges: [], hindrances: [] });
  check("d12 is the ceiling", !tooHigh.valid && tooHigh.errors.some((e) => e.includes("d12")));

  const dodge = { attributes: { ...base, agility: 6 }, skills: {}, edges: ["Dodge"], hindrances: [] };
  check("an edge prerequisite blocks", edgeBlockReason("Dodge", dodge) !== null, edgeBlockReason("Dodge", dodge) ?? "");
  check("a met prerequisite allows the edge", edgeBlockReason("Dodge", { ...dodge, attributes: { ...base, agility: 8 }, skills: { Athletics: 6 } }) === null);

  const blockAttribute = explainAttributeStep("vigor", 12, { attributes: base, skills: {}, edges: [], hindrances: [] });
  check("the guide blocks an unaffordable attribute step", !blockAttribute.allowed && !!blockAttribute.reason, blockAttribute.reason ?? "");

  const blockSkill = explainSkillStep("Shooting", 12, { attributes: base, skills: { Fighting: 12 }, edges: [], hindrances: [] });
  check("the guide blocks an unaffordable skill step", !blockSkill.allowed && !!blockSkill.reason, blockSkill.reason ?? "");

  const explain = explainSkillStep("Shooting", 8, { attributes: { ...base, agility: 6 }, skills: {}, edges: [], hindrances: [] });
  check("the guide explains the above-attribute cost", explain.allowed && explain.cost === 4 && (explain.reason ?? "").includes("2 points"), explain.reason ?? "");

  const edgeCost = explainEdge("Luck", { attributes: base, skills: {}, edges: [], hindrances: [] });
  check("the first edge is free", edgeCost.allowed && edgeCost.cost === 0);

  check("budgets match the book", CREATION.attributePoints === 5 && CREATION.skillPoints === 12 && CREATION.hindrancePointsMax === 4);

  const derived = deriveStats({ vigor: 8, smarts: 4, strength: 12, rank: "Novice", skills: { Fighting: 8 } });
  check("Parry is 2 + half Fighting", derived.parry === 6, String(derived.parry));
  check("Toughness is 2 + half Vigor", derived.toughness === 6, String(derived.toughness));
  check("load limit is 20 lb per Strength step", derived.loadLimit === 100, derived.loadLimit + " lb");
}

// ── Grid combat ──────────────────────────────────────────────
console.log("\n[12] Grid combat");
{
  check("distance uses Chebyshev", distanceSquares({ x: 0, y: 0 }, { x: 3, y: 2 }) === 3);
  check("adjacency includes diagonals", isAdjacent({ x: 0, y: 0 }, { x: 1, y: 1 }) && !isAdjacent({ x: 0, y: 0 }, { x: 2, y: 0 }));

  const wall = [{ x: 2, y: 0, kind: "wall" as const }];
  const blocked = lineOfSight({ x: 0, y: 0 }, { x: 4, y: 0 }, wall);
  check("a wall blocks line of sight", !blocked.clear && blocked.blocker?.x === 2);

  const light = lineOfSight({ x: 0, y: 0 }, { x: 4, y: 0 }, [{ x: 2, y: 0, kind: "cover" as const }]);
  check("cover does not block sight", light.clear && light.coverCells.length === 1);
  check("light cover is -2", coverPenalty({ x: 0, y: 0 }, { x: 4, y: 0 }, [{ x: 2, y: 0, kind: "cover" as const }]) === -2);
  check(
    "heavy cover is -4",
    coverPenalty({ x: 0, y: 0 }, { x: 5, y: 0 }, [{ x: 2, y: 0, kind: "cover" as const }, { x: 3, y: 0, kind: "cover" as const }]) === -4,
  );

  const reach = reachableCells({ x: 0, y: 0 }, wall, 2, 5, 5, []);
  check(
    "walls block movement",
    reach.has("1,0") && !reach.has("2,0"),
    Array.from(reach.keys()).join(" "),
  );
  check("reach stays within the allowance", Array.from(reach.values()).every((cost) => cost <= 2));
  const rough = reachableCells({ x: 0, y: 0 }, [{ x: 1, y: 1, kind: "difficult" as const }], 3, 5, 5, []);
  check("difficult ground costs double", rough.get("1,1") === 2, String(rough.get("1,1")));
  const crowded = reachableCells({ x: 0, y: 0 }, [], 1, 5, 5, [{ x: 1, y: 0 }]);
  check("occupied squares are blocked", !crowded.has("1,0") && crowded.has("0,1"));
  check("path cost is infinite through a wall", pathCost({ x: 0, y: 0 }, { x: 2, y: 0 }, wall, 5, 5) === Infinity);

  check("short range has no penalty", rangeBand(3).penalty === 0 && rangeBand(3).band === "short");
  check("medium range is -2", rangeBand(6).penalty === -2);
  check("long range is -4", rangeBand(12).penalty === -4);
  check("extreme range is -8", rangeBand(20).penalty === -8);
  check("beyond extreme is out of range", !rangeBand(40).inRange && rangeBand(40).band === "out");

  check("gang up is +1 per extra attacker", gangUpBonus(3) === 2);
  check("gang up caps at +4", gangUpBonus(9) === 4);
  check("multiple actions cost -2 each", multiActionPenalty(3) === -4 && multiActionPenalty(1) === 0);
  check("wounds give -1 each, capped at -3", woundPenalty(2) === -2 && woundPenalty(9) === -3);
  check("running adds to the allowance", movementAllowance(6, 4) === 10);

  const melee = attackModifiers({ distance: 30, melee: true, wildAttack: true, gangUp: 2 });
  check("melee ignores range and adds wild attack", melee.total === 3 && !melee.outOfRange, JSON.stringify(melee.parts));

  const ranged = attackModifiers({ distance: 12, cover: -2, running: true, extraActions: 1, aim: true, joker: true, wounds: 1 });
  check(
    "ranged adds range, cover, running, actions, aim, joker and wounds",
    ranged.total === -4 - 2 - 2 - 2 + 2 + 2 - 1,
    JSON.stringify(ranged.parts),
  );
  check("out of range is flagged", attackModifiers({ distance: 99 }).outOfRange);
  check("the breakdown names every part", ranged.parts.every((part) => part.label.length > 0));
}

// ── Campaign knowledge digest ────────────────────────────────
console.log("\n[10] Campaign knowledge digest");
{
  const digest = buildCampaignDigest({
    facts: [
      { category: "Location", text: "Ember Coast is ruled by the Tide Queen", importance: 3 },
      { category: "Character", text: "The Dock Warden counts every crate twice", importance: 1 },
      { category: "Promise", text: "The party owes the Archivist a favour", importance: 2 },
      { category: "Mystery", text: "Who set the docks on fire?", importance: 2 },
    ],
    threads: ["Find the Ember Crown"],
    cast: [
      {
        name: "Dock Warden",
        stance: "Hostile",
        description: "Counts every crate twice",
        agenda: "Control the docks",
        plan: "Hire the party to look the other way",
      },
    ],
    party: ["Hero (Novice) — 3 bennies, 0 wounds, 0 XP"],
    journal: ["The docks burned"],
    arcs: [{ name: "The Drowned Bell", premise: "A bell rings below", goal: "Silence it", status: "Active" }],
    beats: [{ title: "The bell rings again", detail: "The harbour floods", status: "Ready", arcName: "The Drowned Bell" }],
    clocks: [{ name: "Ritual completes", description: "The tide rises", current: 2, max: 6 }],
  });

  check("facts carry category and importance", digest.knowledge.includes("[Location]! Ember Coast"));
  check("facts are ordered by importance", digest.knowledge.indexOf("Tide Queen") < digest.knowledge.indexOf("Dock Warden"));
  const openSection = digest.knowledge.split("OPEN PROMISES & MYSTERIES")[1] ?? "";
  const settledSection = digest.knowledge.split("OPEN PROMISES & MYSTERIES")[0] ?? "";
  check(
    "promises and mysteries leave the settled facts",
    openSection.includes("owes the Archivist") &&
      openSection.includes("Who set the docks on fire?") &&
      !settledSection.includes("owes the Archivist"),
  );
  check(
    "cast, party, threads and journal reach the knowledge block",
    digest.knowledge.includes("Dock Warden (Hostile)") &&
      digest.knowledge.includes("Hero (Novice)") &&
      digest.knowledge.includes("Find the Ember Crown") &&
      digest.knowledge.includes("The docks burned"),
  );
  check(
    "prep carries arcs, events, clocks and agendas",
    digest.prep.includes("[Active] The Drowned Bell") &&
      digest.prep.includes("The bell rings again") &&
      digest.prep.includes("2/6") &&
      digest.prep.includes("wants: Control the docks"),
  );

  const many = Array.from({ length: 400 }, (_, i) => ({
    category: "Event",
    text: `Event number ${i} with a description long enough to matter`,
    importance: 1,
  }));
  const big = buildCampaignDigest({
    facts: many,
    threads: [],
    cast: [],
    party: [],
    journal: [],
    arcs: [],
    beats: [],
    clocks: [],
  });
  check(
    "facts section respects its budget",
    big.knowledge.length <= SECTION_BUDGETS.facts,
    `${big.knowledge.length}/${SECTION_BUDGETS.facts} chars`,
  );
  check("truncation is reported to the GM", big.knowledge.includes("more not shown"));

  check(
    "duplicate detection ignores case, accents and punctuation",
    normalizeFactText("The Tide Queen rules!") === normalizeFactText("the tide  queen rules") &&
      normalizeFactText("O coração da cidade") === normalizeFactText("o coracao da cidade"),
  );

  const empty = buildCampaignDigest({
    facts: [],
    threads: [],
    cast: [],
    party: [],
    journal: [],
    arcs: [],
    beats: [],
    clocks: [],
  });
  check("an empty campaign yields empty blocks", empty.knowledge === "" && empty.prep === "");
}

// ── Summary ──────────────────────────────────────────────────
console.log(failures === 0 ? "\n✅ smoke-rules: all checks passed" : `\n❌ smoke-rules: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
