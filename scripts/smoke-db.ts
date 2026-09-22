/**
 * Smoke test — database-backed features (integration, live DB).
 *
 * Covers: users/campaigns, story resources (threads/cast/scenes),
 * dramatic tasks through the tool layer, custom tables + the
 * ownership boundary, XP/progression on real sheets, oracle
 * logging, chat-turn persistence, lore keyword search and
 * cascade deletes.
 *
 * Run: npx tsx scripts/smoke-db.ts   (DATABASE_URL must point up)
 * Everything created here is deleted again (cleanup on exit).
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { executeTool } from "../src/lib/ai/tools";
import { searchLoreKeyword } from "../src/lib/rag/lore";
import { progress } from "../src/lib/rules/progression";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ✔" : "  ✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const stamp = Date.now();
const emails = [`smoke-db-a-${stamp}@test.local`, `smoke-db-b-${stamp}@test.local`];

async function main() {
  // ── Users & campaign ─────────────────────────────────────
  const passwordHash = await bcrypt.hash("smoke-password-1", 4);
  const userA = await prisma.user.create({
    data: { email: emails[0], passwordHash, name: "Smoke A" },
  });
  const userB = await prisma.user.create({
    data: { email: emails[1], passwordHash, name: "Smoke B" },
  });
  check("users created", !!userA.id && !!userB.id);

  const campaign = await prisma.campaign.create({
    data: {
      userId: userA.id,
      name: "Smoke Campaign",
      genre: "fantasy",
      chaosRank: 5,
      settingNotes: "A test setting about the Ember Coast.",
    },
  });
  const campaignB = await prisma.campaign.create({
    data: { userId: userB.id, name: "Other campaign" },
  });
  check("campaigns created", !!campaign.id && !!campaignB.id);

  // ── Character sheet + XP progression on a real row ───────
  const hero = await prisma.character.create({
    data: { campaignId: campaign.id, name: "Hero", vigor: 6, skills: { Fighting: 6, Notice: 4 } },
  });
  check("character created", hero.xp === 0 && hero.bennies === 3);

  const ctx = { campaignId: campaign.id, chaosRank: 5, askedBy: "ai" as const };
  const xpResult = (await executeTool(
    "award_experience",
    JSON.stringify({ amount: 2 }),
    ctx,
  )) as { awarded: Array<{ name: string; xp: number; rank: string }> };
  const xpAfterFirst = (await prisma.character.findUnique({ where: { id: hero.id } }))!.xp;
  check("award_experience writes XP", xpAfterFirst === 2, JSON.stringify(xpResult));

  await executeTool("award_experience", JSON.stringify({ amount: 3 }), ctx);
  const heroMid = (await prisma.character.findUnique({ where: { id: hero.id } }))!;
  check("5 XP = first advance (Seasoned-bound)", progress(heroMid.xp).advances === 1, `xp=${heroMid.xp}`);

  const xpOther = (await executeTool(
    "award_experience",
    JSON.stringify({ amount: 1, characterName: "Ghost" }),
    ctx,
  ).catch((e) => e)) as unknown;
  check("unknown character rejected", xpOther instanceof Error);

  // ── Story resources ──────────────────────────────────────
  const thread = await prisma.thread.create({
    data: { campaignId: campaign.id, summary: "Find the Ember Crown", tension: 2 },
  });
  const cast = await prisma.storyCharacter.create({
    data: { campaignId: campaign.id, name: "Captain Vex", stance: "Hostile" },
  });
  const scene = await prisma.scene.create({
    data: { campaignId: campaign.id, title: "The Salt Docks", type: "Set" },
  });
  check("threads/cast/scenes created", !!thread.id && !!cast.id && !!scene.id);

  // ── Dramatic task through the tool layer ─────────────────
  const taskCtx = { ...ctx, sceneId: scene.id };
  const started = (await executeTool(
    "start_dramatic_task",
    JSON.stringify({ name: "Free the prisoner", skills: ["Athletics", "Thievery"], requiredSuccesses: 25, timeLimit: 6 }),
    taskCtx,
  )) as { id: string; requiredSuccesses: number };
  const taskRow = await prisma.dramaticTask.findUnique({ where: { id: started.id } });
  check("start_dramatic_task persists", taskRow?.status === "running" && taskRow.successes === 0);

  // Retry guard: a natural crit failure (≈3%) banks −1 instead of
  // tokens, and this test wants to observe real progress.
  interface Attempt {
    roll: { success: boolean; criticalFailure: boolean };
    successes: number;
    timeUsed: number;
    status: string;
  }
  let attempt: Attempt | null = null;
  for (let i = 0; i < 3 && (!attempt || !attempt.roll.success || attempt.roll.criticalFailure); i++) {
    attempt = (await executeTool(
      "advance_dramatic_task",
      JSON.stringify({ skill: "Athletics", dieStep: 12, modifier: 10 }),
      taskCtx,
    )) as Attempt;
  }
  const taskAfter = (await prisma.dramaticTask.findUnique({ where: { id: started.id } }))!;
  check(
    "advance_dramatic_task persists progress",
    taskAfter.timeUsed === attempt!.timeUsed &&
      taskAfter.successes === attempt!.successes &&
      attempt!.roll.success &&
      taskAfter.successes > 0,
    `tokens=${taskAfter.successes}, round=${taskAfter.timeUsed}, status=${taskAfter.status}`,
  );

  const wrongSkill = await executeTool(
    "advance_dramatic_task",
    JSON.stringify({ skill: "Persuasion", dieStep: 6 }),
    taskCtx,
  ).catch((e) => e);
  check("advance with off-list skill rejected", wrongSkill instanceof Error);

  // ── Custom tables + ownership boundary ───────────────────
  const custom = await prisma.customTable.create({
    data: {
      userId: userA.id,
      name: "Ember omens",
      entries: ["Ash falls upward", "The sea turns copper", "Bells ring below", "Shadows point east"],
    },
  });
  const customRoll = (await executeTool("roll_table", JSON.stringify({ table: "Ember omens" }), ctx)) as {
    text: string; custom: boolean; roll: number;
  };
  check(
    "custom table resolves by name and rolls",
    customRoll.custom && ["Ash falls upward", "The sea turns copper", "Bells ring below", "Shadows point east"].includes(customRoll.text),
    `d100=${customRoll.roll} → ${customRoll.text}`,
  );

  const ctxB = { campaignId: campaignB.id, chaosRank: 5, askedBy: "ai" as const };
  const crossRoll = await executeTool("roll_table", JSON.stringify({ table: "Ember omens" }), ctxB).catch((e) => e);
  check("other user cannot roll your custom table", crossRoll instanceof Error, String(crossRoll).slice(0, 60));

  // ── Oracle log ───────────────────────────────────────────
  await prisma.oracleLog.create({
    data: {
      sceneId: scene.id,
      kind: "FateChart",
      question: "Is the tide out?",
      likelihood: "50/50",
      result: { answer: "Yes", roll: 72, threshold: 51 },
      askedBy: "player",
    },
  });
  const logs = await prisma.oracleLog.findMany({ where: { sceneId: scene.id } });
  check("oracle log rows persist", logs.length === 1 && logs[0].kind === "FateChart");

  // ── Chat turns (conversation memory shape) ───────────────
  await prisma.chatTurn.create({ data: { campaignId: campaign.id, role: "user", content: "I check the ropes." } });
  await prisma.chatTurn.create({
    data: { campaignId: campaign.id, role: "assistant", content: "The ropes are wet with brine.", toolTrace: [{ name: "ask_oracle" }] },
  });
  const turns = await prisma.chatTurn.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: "desc" },
    take: 14,
  });
  check("chat turns persist newest-first", turns.length === 2 && turns[0].role === "assistant");

  // ── Lore (keyword fallback path — no embedding key needed) ─
  await prisma.$executeRawUnsafe(
    `INSERT INTO "LoreChunk" ("id", "campaignId", "source", "sourceId", "chunkIndex", "content", "embedding", "createdAt")
     VALUES (gen_random_uuid()::text, $1, 'SettingNotes', NULL, 0, $2, NULL, now())`,
    campaign.id,
    "The Ember Coast is ruled by the Tide Queen, who taxes every sunset.",
  );
  const hits = await searchLoreKeyword(campaign.id, "Tide Queen", 5);
  check("lore keyword search hits", hits.length === 1 && hits[0].content.includes("Tide Queen"));

  // ── Campaign GET shape used by the workspace ─────────────
  const workspace = await prisma.campaign.findFirst({
    where: { id: campaign.id },
    include: {
      characters: true,
      threads: true,
      storyChars: true,
      journal: { orderBy: { order: "asc" } },
      scenes: { orderBy: { createdAt: "desc" }, take: 10 },
      tasks: { orderBy: { updatedAt: "desc" }, take: 10 },
      chatTurns: { orderBy: { createdAt: "desc" }, take: 40 },
    },
  });
  check(
    "workspace include returns every relation",
    !!workspace &&
      workspace.characters.length === 1 &&
      workspace.threads.length === 1 &&
      workspace.storyChars.length === 1 &&
      workspace.scenes.length === 1 &&
      workspace.tasks.length === 1 &&
      workspace.chatTurns.length === 2,
    `chars=${workspace?.characters.length} tasks=${workspace?.tasks.length} turns=${workspace?.chatTurns.length}`,
  );

  // ── Cascade deletes ──────────────────────────────────────
  await prisma.campaign.delete({ where: { id: campaign.id } });
  const orphans = {
    turns: await prisma.chatTurn.count({ where: { campaignId: campaign.id } }),
    tasks: await prisma.dramaticTask.count({ where: { campaignId: campaign.id } }),
    threads: await prisma.thread.count({ where: { campaignId: campaign.id } }),
    chars: await prisma.character.count({ where: { campaignId: campaign.id } }),
    scenes: await prisma.scene.count({ where: { id: scene.id } }),
  };
  check(
    "campaign delete cascades",
    orphans.turns === 0 && orphans.tasks === 0 && orphans.threads === 0 && orphans.chars === 0 && orphans.scenes === 0,
    JSON.stringify(orphans),
  );
  const customLeft = await prisma.customTable.findUnique({ where: { id: custom.id } });
  check("custom table survives campaign delete (user-owned)", !!customLeft);
}

async function cleanup() {
  await prisma.customTable.deleteMany({ where: { userId: { in: undefined } } }).catch(() => undefined);
  await prisma.customTable.deleteMany({ where: { name: "Ember omens" } }).catch(() => undefined);
  await prisma.campaign.deleteMany({ where: { name: { startsWith: "Smoke" }, user: { email: { endsWith: "@test.local" } } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => undefined);
}

main()
  .catch((error) => {
    failures++;
    console.error("  ✘ smoke-db crashed:", error);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log(failures === 0 ? "\n✅ smoke-db: all checks passed" : `\n❌ smoke-db: ${failures} failure(s)`);
    process.exit(failures === 0 ? 0 : 1);
  });
