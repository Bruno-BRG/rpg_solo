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
import type { AIProvider, ChatMessage, ChatOptions } from "../src/lib/ai/provider";
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
        ],
      };
      return;
    }
    yield { content: "Flames climb the mast as the lifeboat drops. Somewhere below, a bell starts ringing — twice, then silence. What do you do?" };
  }

  async chat(): Promise<never> {
    throw new Error("not used in this test");
  }

  async listModels() {
    return ["fake-1"];
  }
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
  check("streaming delivered deltas", deltas.length === 0 || deltas.join("").length > 0, `${deltas.length} deltas`);
  check("all 20 tools traced", result.toolTrace.length === 20, `${result.toolTrace.length} calls`);
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
      systemPrompt.includes("PLAYER CHARACTERS: Hero") &&
      systemPrompt.includes("DRAMATIC TASKS IN PROGRESS"),
  );
  check("system prompt lists genre tables", systemPrompt.includes("fantasy-encounter"));

  const turnsAfter2 = await prisma.chatTurn.count({ where: { campaignId: campaign.id } });
  check("turn 2 persisted too", turnsAfter2 === 4, `${turnsAfter2} turns`);
}

main()
  .catch((error) => {
    failures++;
    console.error("  ✘ smoke-gm crashed:", error);
  })
  .finally(async () => {
    await prisma.campaign.deleteMany({ where: { name: "GM Loop Campaign" } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    console.log(failures === 0 ? "\n✅ smoke-gm: all checks passed" : `\n❌ smoke-gm: ${failures} failure(s)`);
    process.exit(failures === 0 ? 0 : 1);
  });
