/**
 * Smoke test for the GM tool layer.
 *
 * Stateless tools + JSON-schema export run anywhere; DB-backed
 * tools (dramatic tasks, XP, custom tables) are covered by
 * scripts/smoke-db.ts against a live database.
 *
 * Run: npx tsx scripts/smoke-tools.ts
 */
import { executeTool, toolDefinitions } from "../src/lib/ai/tools";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ✔" : "  ✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const ctx = { campaignId: "test", chaosRank: 5, askedBy: "ai" as const };

  // ── Stateful-looking tools that are safe without a DB row ──
  const chaos = await executeTool(
    "set_chaos_rank",
    JSON.stringify({ rank: 7, reason: "ambush sprung" }),
    ctx,
  );
  check("set_chaos_rank", JSON.stringify(chaos).includes('"rank":7'));

  const scene = await executeTool(
    "open_scene",
    JSON.stringify({ title: "The Bazaar at Dusk", goal: "Find the informant", type: "Altered" }),
    ctx,
  );
  check("open_scene (with type)", JSON.stringify(scene).includes("Bazaar"));

  const char = await executeTool(
    "update_character",
    JSON.stringify({ name: "Kael", wounds: 1, bennies: 2, shaken: true }),
    ctx,
  );
  check("update_character", JSON.stringify(char).includes('"wounds":1'));

  // ── Combat ───────────────────────────────────────────────
  const dmg = (await executeTool(
    "roll_damage",
    JSON.stringify({ weaponDice: [6], attackRaises: 2, toughness: 5, isExtra: false, targetName: "Gate Brute" }),
    ctx,
  )) as { total: number; summary: string; bonusRolls: number[] };
  check("roll_damage with attack raises", dmg.bonusRolls.length === 2 && dmg.total > 0, dmg.summary);

  const extra = (await executeTool(
    "roll_damage",
    JSON.stringify({ weaponDice: [3], modifier: -10, toughness: 30, isExtra: true }),
    ctx,
  )) as { summary: string };
  check("roll_damage vs impossible Toughness reports no effect", extra.summary.includes("no effect"), extra.summary);

  const init = (await executeTool(
    "roll_initiative",
    JSON.stringify({ participants: [{ name: "Kael", actor: "wildcard" }, { name: "Thug" }, { name: "Archer" }] }),
    ctx,
  )) as { round: Array<{ name: string; score: number }> };
  check(
    "roll_initiative orders everyone",
    init.round.length === 3 &&
      init.round.every((e, i, a) => i === 0 || a[i - 1].score >= e.score),
    init.round.map((e) => `${e.name}=${e.score}`).join(" "),
  );

  const attack = (await executeTool(
    "roll_dice",
    JSON.stringify({ dieStep: 8, targetNumber: 6, modifier: 0, description: "Stab the gate brute" }),
    ctx,
  )) as { label: string; success: boolean };
  check("roll_dice as attack vs Parry", typeof attack.success === "boolean" && attack.label.includes("Parry") === false, attack.label);

  // ── Oracle ───────────────────────────────────────────────
  const fate = (await executeTool(
    "ask_oracle",
    JSON.stringify({ question: "Is the informant waiting?", likelihood: "50/50" }),
    ctx,
  )) as { answer: string; threshold: number };
  check("ask_oracle", ["Yes", "No", "Exceptional Yes", "Exceptional No"].includes(fate.answer), fate.answer);

  const ev = (await executeTool("random_event", JSON.stringify({ reason: "chaos spike" }), ctx)) as {
    event: { focus: string; action: string; subject: string; description: string };
  };
  check("random_event", !!ev.event.focus && !!ev.event.description.includes("/"), ev.event.description);

  const table = (await executeTool("roll_table", JSON.stringify({ table: "fantasy-encounter" }), ctx)) as {
    text: string; roll: number; custom: boolean;
  };
  check("roll_table (built-in)", table.roll >= 1 && table.roll <= 100 && !table.custom, `d100=${table.roll} → ${table.text}`);

  let unknownTable = false;
  try { await executeTool("roll_table", JSON.stringify({ table: "does-not-exist" }), ctx); }
  catch { unknownTable = true; }
  check("unknown table rejected", unknownTable);

  const setup = (await executeTool("setup_scene", JSON.stringify({ applyToScene: false }), ctx)) as {
    type: string;
  };
  check("setup_scene", ["Set", "Altered", "Interrupt"].includes(setup.type), setup.type);

  // ── Cast & generation ────────────────────────────────────
  const npc = (await executeTool(
    "generate_npc",
    JSON.stringify({ genre: "western", purpose: "stagecoach witness" }),
    ctx,
  )) as { npc: { name: string; stance: string; desire: string }; text: string };
  check(
    "generate_npc",
    npc.npc.name.length > 0 && ["Neutral", "Friendly", "Hostile"].includes(npc.npc.stance) && npc.text.includes("Wants:"),
    `${npc.npc.name} (${npc.npc.stance})`,
  );

  const interlude = (await executeTool("run_interlude", JSON.stringify({ context: "campfire" }), ctx)) as {
    interlude: { question: string; bennyAwarded: boolean };
  };
  check("run_interlude", interlude.interlude.question.endsWith("?") && interlude.interlude.bennyAwarded, interlude.interlude.question);

  // ── Lore ─────────────────────────────────────────────────
  const lore = (await executeTool(
    "search_lore",
    JSON.stringify({ query: "the informant", limit: 3 }),
    ctx,
  )) as { results: unknown[] };
  check("search_lore returns a shape", Array.isArray(lore.results));

  // ── Validation ───────────────────────────────────────────
  for (const [name, args] of [
    ["set_chaos_rank", { rank: 99 }],
    ["roll_dice", { dieStep: 20, description: "nope" }],
    ["roll_damage", { weaponDice: [100], toughness: 5 }],
    ["ask_oracle", { question: "x", likelihood: "Maybe" }],
    ["roll_initiative", { participants: [] }],
    ["remember_facts", { action: "add", facts: [{ category: "Vibe", text: "not a real category" }] }],
    ["remember_facts", { action: "add" }],
    ["plan_story", { section: "dreams", action: "add", name: "x" }],
    ["plan_story", { section: "arcs", action: "add" }],
    ["start_encounter", { name: "" }],
    ["set_terrain", { cells: [] }],
    ["combat_move", { name: "Kael", x: -1, y: 0 }],
    ["attack", { attacker: "Kael", target: "Thug", kind: "spell" }],
    ["end_encounter", { outcome: 42 }],
  ] as const) {
    let rejected = false;
    try { await executeTool(name, JSON.stringify(args), ctx); } catch { rejected = true; }
    check(`invalid input rejected: ${name}`, rejected);
  }

  let unknownTool = false;
  try { await executeTool("frobnicate", "{}", ctx); } catch { unknownTool = true; }
  check("unknown tool rejected", unknownTool);

  // ── Tool definitions / JSON schemas ──────────────────────
  const defs = toolDefinitions();
  check("29 tools exported", defs.length === 29, `${defs.length} tools`);

  const byName = Object.fromEntries(defs.map((d) => [d.function.name, d.function.parameters]));
  const initSchema = byName.roll_initiative as { properties: { participants: { type: string; items: { type: string } } }; required: string[] };
  check(
    "roll_initiative JSON schema has an array of objects",
    initSchema.properties.participants.type === "array" &&
      initSchema.properties.participants.items.type === "object" &&
      initSchema.required.includes("participants"),
  );

  const dmgSchema = byName.roll_damage as { properties: { weaponDice: { type: string }; isExtra?: unknown }; required: string[] };
  check(
    "roll_damage JSON schema types array + optional boolean",
    dmgSchema.properties.weaponDice.type === "array" && !dmgSchema.required.includes("isExtra"),
  );

  const factsSchema = byName.remember_facts as {
    properties: { facts: { type: string; items: { type: string } } };
    required: string[];
  };
  check(
    "remember_facts JSON schema has an array of fact objects",
    factsSchema.properties.facts.type === "array" &&
      factsSchema.properties.facts.items.type === "object" &&
      factsSchema.required.includes("action") &&
      !factsSchema.required.includes("facts"),
  );

  const attackSchema = byName.attack as {
    properties: { attacker: { type: string }; ranges?: { type: string }; weaponDice?: { type: string } };
    required: string[];
  };
  check(
    "attack JSON schema requires attacker and target",
    attackSchema.required.includes("attacker") &&
      attackSchema.required.includes("target") &&
      attackSchema.properties.ranges?.type === "object" &&
      !attackSchema.required.includes("ranges"),
  );

  const missing = defs.filter((d) => !d.function.description || d.function.description.length < 10);
  check("every tool has a real description", missing.length === 0, missing.map((m) => m.function.name).join(","));

  console.log(failures === 0 ? "\n✅ smoke-tools: all checks passed" : `\n❌ smoke-tools: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
