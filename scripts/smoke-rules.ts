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
import { rollInitiative, attackRoll, damageRoll, soakRoll, unshakeRoll, summarizeDamage } from "../src/lib/rules/combat";
import {
  createDramaticTask, applyTaskRoll, advanceTaskRound, taskProgress, tokensForRoll,
} from "../src/lib/rules/dramatic-tasks";
import { runInterlude, interludeOutlook } from "../src/lib/rules/interludes";
import { progress, awardXp, XP_PER_ADVANCE } from "../src/lib/rules/progression";
import { BUILTIN_TABLES, listTables, getTable, rollOnTable, rollOnEntries, TABLE_GENRES } from "../src/lib/oracle/tables";
import { generateNpc, formatNpc, type NpcGenre } from "../src/lib/oracle/npc";

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
  check("soak heals wounds per raise", soak.woundsHealed >= 1 && soak.unshaken, `healed ${soak.woundsHealed}`);

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

// ── Summary ──────────────────────────────────────────────────
console.log(failures === 0 ? "\n✅ smoke-rules: all checks passed" : `\n❌ smoke-rules: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
