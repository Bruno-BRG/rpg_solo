/**
 * Smoke test — the full GM loop against a live database with a
 * scripted AI provider (no tokens spent, no network).
 *
 * Exercises: runGmTurn → streaming → 18-tool batch → side
 * effects (journal, threads, cast, chaos, scene, XP, bennies,
 * dramatic task, oracle log) → chat-turn persistence → history
 * replay on the next turn.
 *
 * Run: npx tsx scripts/smoke-gm.ts
 */
import bcrypt from "bcryptjs";
import type { AIProvider, ChatMessage, ChatOptions, ToolCall } from "../src/lib/ai/provider";
import { runGmTurn, OPENING_DIRECTIVE } from "../src/lib/gm/engine";
import { prisma } from "../src/lib/db";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ✔" : "  ✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** A provider that plays a scripted turn: tools first, prose after. */
class FakeProvider implements AIProvider {
  readonly name = "fake";
  calls = 0;
  /** Messages seen per call — asserted for history replay. */
  seen: ChatMessage[][] = [];

  async *streamChat(options: ChatOptions) {
    this.calls++;
    this.seen.push(options.messages.map((m) => ({ ...m })));

    if (this.calls === 1) {
      yield { content: "The dice turn. " };
      yield {
        toolCalls: [
          { id: "t1", name: "setup_scene", arguments: JSON.stringify({ applyToScene: false }) },
          { id: "t2", name: "open_scene", arguments: JSON.stringify({ title: "Smoke Scene", goal: "prove the loop", type: "Altered" }) },
          { id: "t3", name: "ask_oracle", arguments: JSON.stringify({ question: "Is anyone watching?", likelihood: "Unlikely" }) },
          { id: "t4", name: "random_event", arguments: JSON.stringify({ reason: "chaos spike" }) },
          { id: "t5", name: "roll_table", arguments: JSON.stringify({ table: "fantasy-encounter" }) },
          { id: "t6", name: "generate_npc", arguments: JSON.stringify({ genre: "fantasy" }) },
          { id: "t7", name: "roll_initiative", arguments: JSON.stringify({ participants: [{ name: "Hero", actor: "wildcard" }, { name: "Thug" }] }) },
          { id: "t8", name: "roll_dice", arguments: JSON.stringify({ dieStep: 6, targetNumber: 6, description: "Slashing the rope" }) },
          { id: "t9", name: "roll_damage", arguments: JSON.stringify({ weaponDice: [6], attackRaises: 1, toughness: 5, targetName: "Thug" }) },
          { id: "t10", name: "start_dramatic_task", arguments: JSON.stringify({ name: "Lower the lifeboat", skills: ["Athletics"], requiredSuccesses: 25, timeLimit: 6 }) },
          { id: "t11", name: "advance_dramatic_task", arguments: JSON.stringify({ skill: "Athletics", dieStep: 12, modifier: 10 }) },
          { id: "t12", name: "run_interlude", arguments: JSON.stringify({ context: "before the dive" }) },
          { id: "t13", name: "award_experience", arguments: JSON.stringify({ amount: 2 }) },
          { id: "t14", name: "search_lore", arguments: JSON.stringify({ query: "Ember Coast" }) },
          { id: "t15", name: "update_cast", arguments: JSON.stringify({ action: "add", name: "Dock Warden", stance: "Hostile", description: "Counts every crate twice" }) },
          { id: "t16", name: "update_threads", arguments: JSON.stringify({ action: "add", summary: "Who set the fire?" }) },
          { id: "t17", name: "set_chaos_rank", arguments: JSON.stringify({ rank: 8, reason: "the docks are burning" }) },
          { id: "t18", name: "update_character", arguments: JSON.stringify({ name: "Hero", wounds: 1, bennies: 2 }) },
          { id: "t19", name: "save_journal_entry", arguments: JSON.stringify({ title: "Fire on the Docks", body: "Narrative body.", summary: "The docks burned; a lifeboat was lowered." }) },
          { id: "t20", name: "close_scene", arguments: JSON.stringify({ reason: "the smoke clears" }) },
          { id: "t21", name: "remember_facts", arguments: JSON.stringify({ action: "add", facts: [
            { category: "Location", text: "The Ember Coast is ruled by the Tide Queen", importance: 3 },
            { category: "Promise", text: "The party owes the Dock Warden a favour" },
          ] }) },
          { id: "t22", name: "plan_story", arguments: JSON.stringify({ section: "arcs", action: "add", name: "The Drowned Bell", goal: "Silence the bell" }) },
          { id: "t23", name: "plan_story", arguments: JSON.stringify({ section: "beats", action: "add", title: "The bell rings again", detail: "The harbour floods" }) },
          { id: "t24", name: "plan_story", arguments: JSON.stringify({ section: "clocks", action: "add", name: "Ritual completes", max: 6 }) },
          { id: "t25", name: "start_encounter", arguments: JSON.stringify({
            name: "Fire on the Docks",
            width: 10,
            height: 8,
            combatants: [
              { name: "Hero", character: "Hero", x: 1, y: 1 },
              { name: "Dock Warden", npc: "Dock Warden", x: 2, y: 1, parry: 2, toughness: 4 },
            ],
            terrain: [{ x: 4, y: 0, kind: "wall" }, { x: 4, y: 1, kind: "wall" }, { x: 0, y: 3, kind: "cover" }],
          }) },
          { id: "t26", name: "roll_initiative", arguments: JSON.stringify({ participants: [{ name: "Hero" }, { name: "Dock Warden" }] }) },
          { id: "t27", name: "attack", arguments: JSON.stringify({ attacker: "Hero", target: "Dock Warden", kind: "melee", dieStep: 12, weaponDice: [12], strengthDie: 12, situational: 6 }) },
          { id: "t28", name: "combat_status", arguments: JSON.stringify({}) },
        ],
      };
      return;
    }
    yield { content: "Flames climb the mast as the lifeboat drops. " };
    yield { content: "Somewhere below, a bell starts ringing — twice, then silence. What do you do?" };
  }

  async chat(): Promise<never> {
    throw new Error("not used in this test");
  }

  async listModels() {
    return ["fake-1"];
  }
}

/** A scripted provider for rejection and interrupted-follow-up cases. */
class FailureProvider implements AIProvider {
  readonly name = "failure-fake";
  calls = 0;
  constructor(private readonly toolCalls: ToolCall[], private readonly failAfterTools = false) {}
  async *streamChat(_options: ChatOptions) {
    this.calls++;
    if (this.calls === 1) {
      yield { toolCalls: this.toolCalls };
      return;
    }
    if (this.failAfterTools) throw new Error("scripted provider interruption");
    yield { content: "unexpected continuation" };
  }
  async chat(): Promise<never> { throw new Error("not used"); }
  async listModels() { return ["fake-failure"]; }
}

const stamp = Date.now();
const email = `smoke-gm-${stamp}@test.local`;

async function main() {
  // ── Fixture ──────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("smoke-password-1", 4);
  const user = await prisma.user.create({ data: { email, passwordHash, name: "Smoke GM" } });
  const campaign = await prisma.campaign.create({
    data: { userId: user.id, name: "GM Loop Campaign", genre: "fantasy", chaosRank: 5 },
  });
  const hero = await prisma.character.create({
    data: { campaignId: campaign.id, name: "Hero", bennies: 3 },
  });
  // An open scene exists BEFORE the turn: toolCtx.sceneId lands here.
  const firstScene = await prisma.scene.create({
    data: { campaignId: campaign.id, title: "Harbor Gate", open: true },
  });

  const provider = new FakeProvider();

  // ── Turn 1: opening directive, 20 tools ──────────────────
  const deltas: string[] = [];
  const result = await runGmTurn(
    provider,
    user.id,
    campaign.id,
    OPENING_DIRECTIVE,
    (d) => deltas.push(d),
  );

  check("turn produced narration", result.content.includes("lifeboat"), result.content.slice(0, 60));
  check("streaming delivered deltas across tool calls", deltas.length === 3, `${deltas.length} deltas`);
  check("all 28 tools traced", result.toolTrace.length === 28, `${result.toolTrace.length} calls`);
  check("streamed text exactly matches stored narration", deltas.join("") === result.content, `stream=${deltas.join("").length}, stored=${result.content.length}`);
  check("no tool errored", !result.toolTrace.some((t) => (t.result as { error?: string })?.error),
    result.toolTrace.filter((t) => (t.result as { error?: string })?.error).map((t) => t.name).join(","));

  // Effects reach the UI.
  check("effects.chaosRank propagated", result.effects.chaosRank === 8, String(result.effects.chaosRank));
  check("effects.sceneId propagated (new scene)", !!result.effects.sceneId && result.effects.sceneId !== firstScene.id);

  // ── World state after the turn ───────────────────────────
  const after = await prisma.campaign.findFirst({
    where: { id: campaign.id },
    include: {
      threads: true,
      storyChars: true,
      journal: true,
      scenes: { orderBy: { createdAt: "asc" } },
      tasks: true,
      chatTurns: { orderBy: { createdAt: "asc" } },
      characters: true,
      facts: true,
      arcs: true,
      beats: true,
      clocks: true,
      encounters: { include: { combatants: true } },
    },
  });
  if (!after) throw new Error("campaign vanished");

  check("chaos rank persisted", after.chaosRank === 8);
  check("new scene opened, old one closed",
    after.scenes.length === 2 &&
      after.scenes.find((s) => s.title === "Smoke Scene")?.open === true &&
      after.scenes.find((s) => s.id === firstScene.id)?.open === false,
    after.scenes.map((s) => `${s.title}:${s.open ? "open" : "closed"}`).join(", "),
  );
  check("currentScene updated", after.currentScene === "Smoke Scene");
  check("journal entry persisted", after.journal.length === 1 && after.journal[0].title === "Fire on the Docks");
  check("thread persisted", after.threads.some((t) => t.summary === "Who set the fire?"));
  check("cast persisted", after.storyChars.some((c) => c.name === "Dock Warden" && c.stance === "Hostile"));
  check(
    "facts recorded by the GM persist",
    after.facts.length === 2 && after.facts.some((f) => f.importance === 3),
  );
  check(
    "prep persisted from the opening turn",
    after.arcs.length === 1 && after.beats.length === 1 && after.clocks.length === 1,
  );
  const closeTrace = result.toolTrace.find((t) => t.name === "close_scene")?.result as
    | { guidance?: string }
    | undefined;
  check(
    "closing a scene asks for a prep revision",
    !!closeTrace?.guidance?.includes("plan_story"),
    closeTrace?.guidance?.slice(0, 48) ?? "no guidance",
  );
  const encounter = after.encounters[0];
  check(
    "the GM opened a fight on the grid",
    !!encounter && encounter.status === "Active" && encounter.combatants.length === 2,
    encounter ? encounter.name + " · " + encounter.combatants.length + " pieces" : "no encounter",
  );
  check(
    "cards were dealt to the pieces",
    !!encounter && encounter.combatants.every((c) => c.card !== null),
  );
  const warden = encounter?.combatants.find((c) => c.name === "Dock Warden");
  check(
    "the attack took the NPC out of the fight",
    warden?.status === "Down",
    warden ? warden.status + " · wounds " + warden.wounds : "missing",
  );
  const fightLog = encounter
    ? await prisma.encounterLog.count({ where: { encounterId: encounter.id } })
    : 0;
  check("the fight was written to its history", fightLog >= 3, fightLog + " entries");
  const advanceTrace = result.toolTrace.find((t) => t.name === "advance_dramatic_task")
    ?.result as { roll?: { criticalFailure?: boolean } } | undefined;
  // A critical failure (2.8%) banks −1 token → 0; otherwise progress.
  const critFailed = advanceTrace?.roll?.criticalFailure === true;
  check(
    "dramatic task persisted",
    after.tasks.length === 1 &&
      after.tasks[0].timeUsed === 1 &&
      (critFailed ? after.tasks[0].successes === 0 : after.tasks[0].successes > 0),
    `${after.tasks[0]?.successes}/${after.tasks[0]?.requiredSuccesses}, round ${after.tasks[0]?.timeUsed}${critFailed ? " (crit)" : ""}`,
  );

  const heroAfter = after.characters[0];
  check("update_character applied", heroAfter.wounds === 1 && heroAfter.bennies === 2, `wounds=${heroAfter.wounds} bennies=${heroAfter.bennies}`);
  check("award_experience applied (+2)", heroAfter.xp === 2, `xp=${heroAfter.xp}`);
  // Interlude grants +1 benny on top (order: bennies set to 2 by update_character, interlude ran before →
  // update_character overwrote to 2; assert only that XP is right and bennies ≤ 5).
  check("bennies within bounds", heroAfter.bennies >= 0 && heroAfter.bennies <= 5);

  // Oracle logs attach to the scene live at call time: tools run before the
  // opening open_scene land on the initial scene, the rest on the new one.
  const oracleLogs = await prisma.oracleLog.findMany({
    where: { sceneId: { in: [firstScene.id, after.scenes.find((s) => s.title === "Smoke Scene")?.id ?? ""] } },
  });
  const kinds = new Set(oracleLogs.map((l) => l.kind));
  check("AI oracle calls logged",
    ["FateChart", "RandomEvent", "CustomTable", "SceneSetup", "Interlude", "Npc"].every((k) => kinds.has(k)),
    Array.from(kinds).join(","),
  );
  check("oracle logs marked askedBy=ai", oracleLogs.every((l) => l.askedBy === "ai"));

  check("chat turns persisted (1 user + 1 assistant)",
    after.chatTurns.length === 2 &&
      after.chatTurns[0].role === "user" &&
      after.chatTurns[0].content === "Begin the adventure." &&
      after.chatTurns[1].role === "assistant",
    after.chatTurns.map((t) => t.role).join(","),
  );
  check("persisted narration exactly matches stream", after.chatTurns[1]?.content === deltas.join(""));

  // ── Turn 2: history must replay as context ───────────────
  // Turn 1 consumed two provider calls (tools pass + prose pass),
  // so turn 2 starts at the next recorded call.
  const turn2Index = provider.seen.length;
  const result2 = await runGmTurn(provider, user.id, campaign.id, "I dive for the bell.");
  const secondCall = provider.seen[turn2Index];
  const contents = secondCall.map((m) => m.content);

  check("turn 2 produced narration", result2.content.length > 0);
  check("system prompt present on turn 2", secondCall[0].role === "system" && secondCall[0].content.includes("GM PROTOCOL"));
  check("history replays prior user turn", contents.includes("Begin the adventure."));
  check("history replays prior assistant turn", contents.some((c) => c.includes("lifeboat")));
  check("turn 2 input present last", secondCall[secondCall.length - 1].content === "I dive for the bell.");
  check("history is text-only (no tool roles replayed)", !secondCall.some((m) => m.role === "tool"));

  const systemPrompt = secondCall[0].content;
  check("system prompt carries campaign state",
    systemPrompt.includes("GM Loop Campaign") &&
      systemPrompt.includes("CHAOS RANK: 8") &&
      systemPrompt.includes("PLAYER CHARACTERS:") &&
      systemPrompt.includes("Hero (") &&
      systemPrompt.includes("DRAMATIC TASKS IN PROGRESS"),
  );
  check("system prompt lists genre tables", systemPrompt.includes("fantasy-encounter"));
  check(
    "facts recorded in turn 1 reach the turn 2 notebook",
    systemPrompt.includes("CAMPAIGN KNOWLEDGE") && systemPrompt.includes("Tide Queen"),
  );
  check(
    "prep from turn 1 reaches the turn 2 prompt",
    systemPrompt.includes("YOUR PREP") && systemPrompt.includes("The Drowned Bell"),
  );
  check(
    "the grid reaches the turn 2 prompt",
    systemPrompt.includes("ENCOUNTER ON THE GRID") &&
      systemPrompt.includes("Fire on the Docks") &&
      systemPrompt.includes("Dock Warden"),
  );

  const turnsAfter2 = await prisma.chatTurn.count({ where: { campaignId: campaign.id } });
  check("turn 2 persisted too", turnsAfter2 === 4, `${turnsAfter2} turns`);

  // ── A fact-heavy campaign must not flood the prompt ──────
  const heavyCampaign = await prisma.campaign.create({
    data: { userId: user.id, name: "GM Heavy Campaign", genre: "fantasy" },
  });
  await prisma.campaignFact.createMany({
    data: Array.from({ length: 200 }, (_, i) => ({
      campaignId: heavyCampaign.id,
      category: "Event",
      text: `Established detail number ${i} about the Ember Coast and its people`,
      importance: 1,
    })),
  });
  const heavyIndex = provider.seen.length;
  await runGmTurn(provider, user.id, heavyCampaign.id, "What do I remember?");
  const heavyPrompt = provider.seen[heavyIndex][0].content;
  const knowledgeBlock = heavyPrompt.split("CAMPAIGN KNOWLEDGE")[1]?.split("YOUR PREP")[0] ?? "";
  check(
    "digest stays bounded in a fact-heavy campaign",
    knowledgeBlock.length > 0 && knowledgeBlock.length <= 4000,
    `${knowledgeBlock.length} chars for 200 facts`,
  );
  check("truncation is announced to the GM", heavyPrompt.includes("more not shown"));

  // ── Rejected tool must not mutate; later provider failure keeps earlier effects ──
  const failureCampaign = await prisma.campaign.create({
    data: { userId: user.id, name: "GM Failure Campaign", chaosRank: 4 },
  });
  const invalid = new FailureProvider([
    { id: "bad-open", name: "open_scene", arguments: JSON.stringify({ title: "" }) },
  ]);
  const invalidResult = await runGmTurn(invalid, user.id, failureCampaign.id, "Try the invalid scene.");
  const invalidState = await prisma.campaign.findUnique({ where: { id: failureCampaign.id }, include: { scenes: true, chatTurns: true } });
  check("invalid tool fails the turn", invalidResult.status === "failed");
  check("invalid tool leaves campaign unchanged", invalidState?.chaosRank === 4 && invalidState.scenes.length === 0);
  check("invalid turn failure is persisted", invalidState?.chatTurns.some((t) => t.role === "assistant" && t.status === "failed") ?? false);

  const partial = new FailureProvider([
    { id: "valid-chaos", name: "set_chaos_rank", arguments: JSON.stringify({ rank: 7, reason: "scripted consequence" }) },
  ], true);
  const partialDeltas: string[] = [];
  const partialResult = await runGmTurn(partial, user.id, failureCampaign.id, "Raise the danger.", (d) => partialDeltas.push(d));
  const partialState = await prisma.campaign.findUnique({ where: { id: failureCampaign.id }, include: { chatTurns: { orderBy: { createdAt: "desc" }, take: 1 } } });
  check("completed effects survive provider failure", partialState?.chaosRank === 7);
  check("provider failure is recorded on assistant turn", partialResult.status === "failed" && partialState?.chatTurns[0]?.status === "failed");
  check("failed narration exactly matches persisted text", partialState?.chatTurns[0]?.content === partialResult.content && partialResult.content.includes("scripted provider interruption"));
  check("failed turn stream exactly matches persisted text", partialDeltas.join("") === partialResult.content);

  // A move the rules refuse must fail the turn without moving the piece.
  const slowMove = new FailureProvider([
    {
      id: "s1",
      name: "start_encounter",
      arguments: JSON.stringify({
        name: "Slow Fight",
        width: 10,
        height: 10,
        combatants: [{ name: "Sluggish", x: 0, y: 0, pace: 2, isExtra: true }],
      }),
    },
    {
      id: "s2",
      name: "combat_move",
      arguments: JSON.stringify({ name: "Sluggish", x: 9, y: 9 }),
    },
  ]);
  const slowResult = await runGmTurn(slowMove, user.id, failureCampaign.id, "The sluggish thing charges.");
  const sluggish = await prisma.combatant.findFirst({
    where: { encounter: { campaignId: failureCampaign.id }, name: "Sluggish" },
  });
  check(
    "a move beyond the Pace fails the turn without moving the piece",
    slowResult.status === "failed" && sluggish?.x === 0 && sluggish?.y === 0,
    slowResult.status + " at " + (sluggish ? sluggish.x + "," + sluggish.y : "missing"),
  );
}

main()
  .catch((error) => {
    failures++;
    console.error("  ✘ smoke-gm crashed:", error);
  })
  .finally(async () => {
    await prisma.campaign.deleteMany({ where: { name: { startsWith: "GM " } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    console.log(failures === 0 ? "\n✅ smoke-gm: all checks passed" : `\n❌ smoke-gm: ${failures} failure(s)`);
    process.exit(failures === 0 ? 0 : 1);
  });
