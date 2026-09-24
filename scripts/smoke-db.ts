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
import { ensureCampaignLoreIndexed, ingestDocument, searchLoreKeyword } from "../src/lib/rag/lore";
import { progress } from "../src/lib/rules/progression";
import { buildCampaignDigest } from "../src/lib/gm/knowledge";

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
  const shakenHero = await prisma.character.update({ where: { id: hero.id }, data: { shaken: true } });
  check("character shaken condition persists", shakenHero.shaken);

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
  const userTurn = await prisma.chatTurn.create({ data: { campaignId: campaign.id, role: "user", content: "I check the ropes." } });
  await prisma.chatTurn.create({
    data: { campaignId: campaign.id, role: "assistant", content: "The ropes are wet with brine.", toolTrace: [{ name: "ask_oracle" }] },
  });
  const turns = await prisma.chatTurn.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: "desc" },
    take: 14,
  });
  check("chat turns persist newest-first", turns.length === 2 && turns[0].role === "assistant");
  check("chat turn defaults to complete", userTurn.status === "complete");

  // ── Lore (keyword fallback path — no embedding key needed) ─
  await prisma.$executeRawUnsafe(
    `INSERT INTO "LoreChunk" ("id", "campaignId", "source", "sourceId", "chunkIndex", "content", "embedding", "createdAt")
     VALUES (gen_random_uuid()::text, $1, 'SettingNotes', NULL, 0, $2, NULL, now())`,
    campaign.id,
    "The Ember Coast is ruled by the Tide Queen, who taxes every sunset.",
  );
  const hits = await searchLoreKeyword(campaign.id, "Tide Queen", 5);
  check("lore keyword search hits", hits.length === 1 && hits[0].content.includes("Tide Queen"));
  await ingestDocument(null, campaign.id, "Character", hero.id, "Hero background: raised among the glass wolves.");
  const textOnly = await prisma.loreChunk.findMany({ where: { campaignId: campaign.id, source: "Character", sourceId: hero.id } });
  check("lore ingests without embeddings", textOnly.length === 1 && textOnly[0].content.includes("glass wolves"));
  await ingestDocument(null, campaign.id, "Character", hero.id, "Hero background: now seeks the lost observatory.");
  const replaced = await prisma.loreChunk.findMany({ where: { campaignId: campaign.id, source: "Character", sourceId: hero.id } });
  check("lore source reingestion replaces stale chunks", replaced.length === 1 && replaced[0].content.includes("lost observatory") && !replaced[0].content.includes("glass wolves"));
  const keywordFallback = await searchLoreKeyword(campaign.id, "lost observatory", 5);
  check("lore keyword fallback matches terms without embeddings", keywordFallback.some((hit) => hit.content.includes("lost observatory")));
  await ingestDocument(null, campaign.id, "Rules", "accent-check", "O coração da cidade guarda o portal.");
  const accentHits = await searchLoreKeyword(campaign.id, "coracao", 5);
  check("lore keyword fallback ignores accents", accentHits.some((hit) => hit.content.includes("coração")));
  const backgroundCharacter = await prisma.character.create({
    data: { campaignId: campaign.id, name: "Archivist", background: "Once guarded the obsidian archive." },
  });
  const journalEntry = await prisma.journalEntry.create({
    data: { campaignId: campaign.id, title: "The drowned bell", body: "A silver bell rang beneath the harbor." },
  });
  await ensureCampaignLoreIndexed(campaign.id);
  const backfilled = await prisma.loreChunk.findMany({ where: { campaignId: campaign.id } });
  check("existing notes, backgrounds, and journal are backfilled", ["SettingNotes", "Character", "Journal"].every((source) => backfilled.some((chunk) => chunk.source === source)) && backfilled.some((chunk) => chunk.sourceId === backgroundCharacter.id) && backfilled.some((chunk) => chunk.sourceId === journalEntry.id));

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
      facts: true,
      arcs: true,
      beats: true,
      clocks: true,
    },
  });
  check(
    "workspace include returns every relation",
    !!workspace &&
      workspace.characters.length === 2 &&
      workspace.threads.length === 1 &&
      workspace.storyChars.length === 1 &&
      workspace.scenes.length === 1 &&
      workspace.tasks.length === 1 &&
      workspace.chatTurns.length === 2,
    `chars=${workspace?.characters.length} tasks=${workspace?.tasks.length} turns=${workspace?.chatTurns.length}`,
  );

  // ── Campaign knowledge (facts through the tool layer) ────
  const factCtx = { campaignId: campaign.id, chaosRank: campaign.chaosRank, askedBy: "ai" as const };

  const recorded = (await executeTool(
    "remember_facts",
    JSON.stringify({
      action: "add",
      facts: [
        { category: "Location", text: "Ember Coast is ruled by the Tide Queen", importance: 3 },
        { category: "Promise", text: "The party owes the Archivist a favour" },
      ],
    }),
    factCtx,
  )) as { recorded: unknown[] };
  check("remember_facts records facts", recorded.recorded.length === 2);

  const duplicate = (await executeTool(
    "remember_facts",
    JSON.stringify({
      action: "add",
      facts: [{ category: "Location", text: "ember coast is RULED by the tide queen!" }],
    }),
    factCtx,
  )) as { recorded: unknown[]; skippedDuplicates: string[] };
  check(
    "remember_facts dedupes the same fact",
    duplicate.recorded.length === 0 && duplicate.skippedDuplicates.length === 1,
  );

  const listed = (await executeTool(
    "remember_facts",
    JSON.stringify({ action: "list" }),
    factCtx,
  )) as { facts: unknown[] };
  check("remember_facts lists what it knows", listed.facts.length === 2);

  const edited = (await executeTool(
    "remember_facts",
    JSON.stringify({
      action: "update",
      match: "tide queen",
      text: "Ember Coast is ruled by the Tide Queen and her salt wardens",
    }),
    factCtx,
  )) as { updated: { text: string } };
  check("remember_facts updates a fact", edited.updated.text.includes("salt wardens"));

  const archived = (await executeTool(
    "remember_facts",
    JSON.stringify({ action: "archive", match: "Archivist" }),
    factCtx,
  )) as { archived: string };
  const archivedRow = await prisma.campaignFact.findFirst({
    where: { campaignId: campaign.id, status: "Archived" },
  });
  check("remember_facts archives a fact", !!archived.archived && !!archivedRow);

  const factChunks = await prisma.loreChunk.count({
    where: { campaignId: campaign.id, source: "Fact" },
  });
  check("facts join the searchable memory", factChunks >= 1, `${factChunks} chunks`);

  // ── GM prep (arcs, events, clocks, agendas) ──────────────
  const arc = (await executeTool(
    "plan_story",
    JSON.stringify({ section: "arcs", action: "add", name: "The Drowned Bell", goal: "Silence the bell" }),
    factCtx,
  )) as { arc: { id: string } };
  await executeTool(
    "plan_story",
    JSON.stringify({ section: "beats", action: "add", title: "The bell rings again", arc: "Drowned Bell" }),
    factCtx,
  );
  await executeTool(
    "plan_story",
    JSON.stringify({ section: "clocks", action: "add", name: "Ritual completes", max: 6 }),
    factCtx,
  );
  await executeTool(
    "plan_story",
    JSON.stringify({ section: "agendas", action: "add", npc: "Captain Vex", agenda: "Recover the Ember Crown", plan: "Hire the party" }),
    factCtx,
  );

  const prep = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    include: { arcs: true, beats: true, clocks: true, storyChars: true, facts: true },
  });
  check(
    "plan_story persists arcs, events and clocks",
    prep?.arcs.length === 1 && prep.beats.length === 1 && prep.clocks.length === 1,
  );
  check("prepared events link to their arc", prep?.beats[0]?.arcId === arc.arc.id);
  check(
    "agendas attach to the cast",
    prep?.storyChars.some((c) => c.agenda === "Recover the Ember Crown") === true,
  );

  // ── The digest the GM actually receives ─────────────────
  const digest = buildCampaignDigest({
    // The engine only feeds active facts into the digest.
    facts: (prep?.facts ?? [])
      .filter((f) => f.status === "Active")
      .map((f) => ({ category: f.category, text: f.text, importance: f.importance })),
    threads: [thread.summary],
    cast: (prep?.storyChars ?? []).map((c) => ({
      name: c.name,
      stance: c.stance,
      description: c.description,
      agenda: c.agenda,
      plan: c.plan,
    })),
    party: ["Hero (Novice) — 3 bennies"],
    journal: [journalEntry.title],
    arcs: (prep?.arcs ?? []).map((a) => ({ name: a.name, premise: a.premise, goal: a.goal, status: a.status })),
    beats: (prep?.beats ?? []).map((b) => ({ title: b.title, detail: b.detail, status: b.status, arcName: "The Drowned Bell" })),
    clocks: (prep?.clocks ?? []).map((c) => ({ name: c.name, description: c.description, current: c.current, max: c.max })),
  });
  check(
    "digest carries the recorded facts",
    digest.knowledge.includes("salt wardens") && !digest.knowledge.includes("owes the Archivist"),
    digest.knowledge.split("\n")[1] ?? "",
  );
  check(
    "digest carries the GM's prep",
    digest.prep.includes("The Drowned Bell") && digest.prep.includes("Recover the Ember Crown"),
  );

  // ── Cascade deletes ──────────────────────────────────────
  await prisma.campaign.delete({ where: { id: campaign.id } });
  const orphans = {
    turns: await prisma.chatTurn.count({ where: { campaignId: campaign.id } }),
    tasks: await prisma.dramaticTask.count({ where: { campaignId: campaign.id } }),
    threads: await prisma.thread.count({ where: { campaignId: campaign.id } }),
    chars: await prisma.character.count({ where: { campaignId: campaign.id } }),
    scenes: await prisma.scene.count({ where: { id: scene.id } }),
    facts: await prisma.campaignFact.count({ where: { campaignId: campaign.id } }),
    arcs: await prisma.storyArc.count({ where: { campaignId: campaign.id } }),
    beats: await prisma.storyBeat.count({ where: { campaignId: campaign.id } }),
    clocks: await prisma.storyClock.count({ where: { campaignId: campaign.id } }),
  };
  check(
    "campaign delete cascades",
    Object.values(orphans).every((count) => count === 0),
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
