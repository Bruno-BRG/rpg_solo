/**
 * Smoke test — HTTP end-to-end against a running server.
 *
 * Full connection test with a real login session:
 * health → register → NextAuth credentials login → campaigns →
 * story resources → oracle (all kinds) → tables CRUD → character
 * sheet PATCH → dice → AI settings/models → chat route →
 * authorization boundaries (401/404) → cleanup.
 *
 * Run: npm run dev   (in another terminal, port 3000)
 *      npx tsx scripts/smoke-api.ts
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

const BASE = process.env.API_BASE ?? "http://localhost:3000";
const stamp = Date.now();
const emailA = `smoke-api-a-${stamp}@test.local`;
const emailB = `smoke-api-b-${stamp}@test.local`;
const PASSWORD = "smoke-api-pass-1";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ✔" : "  ✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// ── Fetch helpers ────────────────────────────────────────────

function readSetCookie(res: Response): string[] {
  return res.headers.getSetCookie().map((c) => c.split(";")[0]);
}

function mergeCookies(jar: string[], setCookies: string[]): string[] {
  const map = new Map<string, string>();
  for (const c of [...jar, ...setCookies]) {
    const [name, ...rest] = c.split("=");
    map.set(name.trim(), rest.join("="));
  }
  return Array.from(map.entries()).map(([n, v]) => `${n}=${v}`);
}

async function req(
  path: string,
  init: RequestInit = {},
  cookies: string[] = [],
): Promise<{ status: number; data: any; cookies: string[] }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      ...(init.body && typeof init.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...(cookies.length ? { Cookie: cookies.join("; ") } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, data, cookies: mergeCookies(cookies, readSetCookie(res)) };
}

function json(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

async function loginWith(email: string, password: string): Promise<string[]> {
  let jar: string[] = [];
  const csrf = await req("/api/auth/csrf", {}, jar);
  const token = csrf.data?.csrfToken;
  jar = csrf.cookies;
  if (!token) throw new Error(`csrf failed: ${JSON.stringify(csrf.data)}`);

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Cookie: jar.join("; "),
    },
    body: new URLSearchParams({
      csrfToken: token,
      email,
      password,
      json: "true",
    }).toString(),
  });
  jar = mergeCookies(jar, readSetCookie(res));
  return jar;
}

// ── Test flow ────────────────────────────────────────────────

async function main() {
  // 1. Health / DB connection
  const health = await req("/api/health");
  check("GET /api/health", health.status === 200 && health.data?.database === "up",
    JSON.stringify(health.data));
  if (health.status !== 200) {
    throw new Error("Server or database not reachable — start `npm run dev` and Postgres first.");
  }

  // 2. Register two users
  const regA = await req("/api/register", json({ email: emailA, password: PASSWORD, name: "API A" }));
  const regB = await req("/api/register", json({ email: emailB, password: PASSWORD, name: "API B" }));
  check("POST /api/register (A, B)", regA.status === 201 && regB.status === 201,
    `${regA.status}, ${regB.status}`);
  const dupe = await req("/api/register", json({ email: emailA, password: PASSWORD }));
  check("duplicate email rejected", dupe.status === 409, String(dupe.status));

  // 3. Credentials login
  const sessionA = await loginWith(emailA, PASSWORD);
  const sessionB = await loginWith(emailB, PASSWORD);
  const who = await req("/api/auth/session", {}, sessionA);
  check("NextAuth credentials session", who.data?.user?.email === emailA, who.data?.user?.email);

  // 4. Authorization boundary
  const anon = await req("/api/campaigns");
  check("anonymous → 401", anon.status === 401, String(anon.status));

  // 5. Campaign CRUD
  const created = await req("/api/campaigns", json({
    name: "API Smoke Campaign",
    genre: "weird west",
    settingNotes: "Dust, lightning and a railroad that never stops.",
  }), sessionA);
  check("POST /api/campaigns", created.status === 201, String(created.status));
  const campaignId = created.data?.campaign?.id as string;

  const list = await req("/api/campaigns", {}, sessionA);
  check("GET /api/campaigns lists it", list.data?.campaigns?.some((c: any) => c.id === campaignId));

  const state = await req(`/api/campaigns/${campaignId}`, {}, sessionA);
  check(
    "GET campaign state has every relation",
    state.status === 200 &&
      Array.isArray(state.data.campaign.tasks) &&
      Array.isArray(state.data.campaign.chatTurns) &&
      Array.isArray(state.data.campaign.threads),
    `tasks=${state.data?.campaign?.tasks?.length} turns=${state.data?.campaign?.chatTurns?.length}`,
  );

  const patched = await req(`/api/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({ chaosRank: 7 }),
  }, sessionA);
  check("PATCH chaos rank", patched.data?.campaign?.chaosRank === 7);

  // 5b. Per-campaign AI config (model / persona / temperature).
  const cfgPatch = await req(`/api/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({ chatModel: "gpt-4o", gmPersona: "terse, dry humor", temperature: 1.1 }),
  }, sessionA);
  check("PATCH per-campaign AI config",
    cfgPatch.data?.campaign?.chatModel === "gpt-4o" &&
    cfgPatch.data?.campaign?.gmPersona === "terse, dry humor" &&
    cfgPatch.data?.campaign?.temperature === 1.1,
    JSON.stringify(cfgPatch.data),
  );
  const cfgGet = await req(`/api/campaigns/${campaignId}`, {}, sessionA);
  check("GET returns AI config",
    cfgGet.data?.campaign?.chatModel === "gpt-4o" && cfgGet.data?.campaign?.gmPersona === "terse, dry humor");
  const cfgClear = await req(`/api/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({ chatModel: null, gmPersona: null }),
  }, sessionA);
  check("PATCH clears overrides (null → user global)",
    cfgClear.data?.campaign?.chatModel === null && cfgClear.data?.campaign?.gmPersona === null);

  // 6. Story resources (threads, cast, scenes, tasks)
  const thread = await req(`/api/campaigns/${campaignId}/story`,
    json({ resource: "threads", summary: "Who robbed the train?", tension: 2 }), sessionA);
  const cast = await req(`/api/campaigns/${campaignId}/story`,
    json({ resource: "cast", name: "Sheriff Calder", stance: "Friendly", description: "One-booted lawman" }), sessionA);
  const scene = await req(`/api/campaigns/${campaignId}/story`,
    json({ resource: "scenes", title: "Platform 9, midnight" }), sessionA);
  const task = await req(`/api/campaigns/${campaignId}/story`,
    json({ resource: "tasks", name: "Stop the dynamite car", skills: ["Driving", "Notice"], requiredSuccesses: 10, timeLimit: 4 }), sessionA);
  check("story: threads/cast/scenes/tasks",
    [thread, cast, scene, task].every((r) => r.status === 201),
    [thread.status, cast.status, scene.status, task.status].join(","));
  const sceneId = scene.data?.scene?.id as string;

  const badTask = await req(`/api/campaigns/${campaignId}/story`,
    json({ resource: "tasks", name: "Bad", skills: [] }), sessionA);
  check("invalid task rejected", badTask.status === 400, String(badTask.status));

  // 7. Oracle — every kind
  const oracleKinds: Array<[string, object, (r: any) => boolean]> = [
    ["FateChart", { question: "Is the sheriff waiting?", likelihood: "Likely" },
      (r) => ["Yes", "No", "Exceptional Yes", "Exceptional No"].includes(r.answer) && typeof r.odds === "number"],
    ["RandomEvent", {}, (r) => !!r.event?.focus || !!r.focus],
    ["DetailCheck", { detailKind: "Subject" }, (r) => !!(r.word ?? r.subject)],
    ["SceneSetup", {}, (r) => ["Set", "Altered", "Interrupt"].includes(r.type)],
    ["Table", { tableId: "western-encounter" }, (r) => r.roll >= 1 && r.roll <= 100 && !!r.text],
    ["Interlude", { context: "the saloon" }, (r) => String(r.question ?? r.interlude?.question ?? "").length > 0],
    ["Npc", { genre: "western" }, (r) => !!(r.npc?.name ?? r.name)],
  ];
  for (const [kind, extra, verify] of oracleKinds) {
    const res = await req("/api/oracle", json({ sceneId, kind, question: `q-${kind}`, ...extra }), sessionA);
    const ok = res.status === 200 && verify(res.data?.result);
    check(`oracle: ${kind}`, ok, ok ? JSON.stringify(res.data?.result).slice(0, 70) : `status=${res.status} ${JSON.stringify(res.data)}`);
  }

  const missingScene = await req("/api/oracle", json({ sceneId: "nope", kind: "FateChart" }), sessionA);
  check("oracle: unknown scene → 404", missingScene.status === 404, String(missingScene.status));
  const badKind = await req("/api/oracle", json({ sceneId, kind: "CrystalBall" }), sessionA);
  check("oracle: invalid kind → 400", badKind.status === 400, String(badKind.status));

  const oracleLog = await req(`/api/oracle?sceneId=${sceneId}`, {}, sessionA);
  check("oracle log has all AI+player entries", oracleLog.data?.logs?.length >= 7, `${oracleLog.data?.logs?.length} logs`);

  // 8. Tables CRUD
  const tables = await req("/api/tables", {}, sessionA);
  check("GET /api/tables library", tables.data?.builtin?.length >= 27 && tables.data?.genres?.includes("horror"),
    `${tables.data?.builtin?.length} builtin`);

  const custom = await req("/api/tables", json({
    name: "Train cargo",
    description: "What's in the boxcar",
    entries: ["Liquor", "Rifles", "Dynamite", "Gold dust", "Medicine", "Coal", "Contraband", "Empty", "Cattle", "Mail"],
  }), sessionA);
  check("POST custom table", custom.status === 201, String(custom.status));
  const customId = custom.data?.table?.id as string;

  const badEntries = await req("/api/tables", json({
    name: "Bad bands",
    entries: ["a", "b", "c", "d", "e", "f", "g"], // 7 doesn't divide 100 (>4)
  }), sessionA);
  check("invalid entry bands rejected", badEntries.status === 400,
    JSON.stringify(badEntries.data?.details ?? badEntries.data).slice(0, 100));

  const customRoll = await req("/api/oracle", json({ sceneId, kind: "Table", tableId: customId }), sessionA);
  check("roll on custom table via oracle",
    customRoll.status === 200 && customRoll.data?.result?.custom === true,
    JSON.stringify(customRoll.data?.result ?? customRoll.data).slice(0, 80));

  const wrongName = await req("/api/oracle", json({ sceneId, kind: "Table", tableId: "not-a-table" }), sessionA);
  check("unknown table → 400 with message", wrongName.status === 400 && /Unknown table/.test(wrongName.data?.error ?? ""),
    wrongName.data?.error);

  // 9. Character sheet: create + PATCH (XP/condition)
  const character = await req(`/api/campaigns/${campaignId}/characters`, json({
    name: "Wilhelmina Vance", rank: "Novice", vigor: 6, agility: 6,
    skills: { Fighting: 6, Shooting: 8, Notice: 4 }, bennies: 3,
  }), sessionA);
  check("POST character", character.status === 201, String(character.status));
  const charId = character.data?.character?.id as string;

  const xpPatch = await req(`/api/campaigns/${campaignId}/characters`, {
    method: "PATCH",
    body: JSON.stringify({ id: charId, xp: 6, bennies: 2, wounds: 1 }),
  }, sessionA);
  check("PATCH character XP/bennies/wounds", xpPatch.data?.character?.xp === 6 && xpPatch.data?.character?.wounds === 1,
    `xp=${xpPatch.data?.character?.xp} wounds=${xpPatch.data?.character?.wounds}`);

  const badPatch = await req(`/api/campaigns/${campaignId}/characters`, {
    method: "PATCH",
    body: JSON.stringify({ id: charId, xp: -5 }),
  }, sessionA);
  check("PATCH validation rejects negative XP", badPatch.status === 400, String(badPatch.status));

  // 10. Dice endpoint
  const dice = await req("/api/dice", json({ mode: "trait", dieStep: 8, targetNumber: 4 }), sessionA);
  check("POST /api/dice trait roll", dice.status === 200 && typeof dice.data?.result?.total === "number",
    `total=${dice.data?.result?.total}`);
  const dicePlain = await req("/api/dice", json({ mode: "plain", sides: 6, count: 3 }), sessionA);
  check("POST /api/dice plain roll", dicePlain.data?.result?.rolls?.length === 3);

  // 11. AI settings + models catalog
  const settings = await req("/api/settings/ai", {}, sessionA);
  check("GET /api/settings/ai", settings.status === 200 && settings.data?.providers?.["openai-api"]);
  const put = await req("/api/settings/ai", {
    method: "PUT",
    body: JSON.stringify({ provider: "openai-api", chatModel: "gpt-4o", gmPersona: "You are a noir narrator." }),
  }, sessionA);
  check("PUT /api/settings/ai", put.status === 200, JSON.stringify(put.data));
  const models = await req("/api/ai/models?provider=chatgpt-oauth", {}, sessionA);
  check("GET /api/ai/models catalog", models.status === 200 && Array.isArray(models.data?.models) && models.data.models.length > 0,
    `${models.data?.models?.length} models (${models.data?.source})`);

  // 12. Chat route — completes the wiring test
  const chat = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessionA.join("; ") },
    body: JSON.stringify({ campaignId, opening: true }),
  });
  if (chat.status === 200) {
    const body = await chat.text();
    check("POST /api/chat streams SSE",
      body.includes("event: done") || body.includes("event: error"),
      body.includes("event: error") ? `error event: ${body.match(/event: error[\s\S]{0,200}/)?.[0]?.replace(/\s+/g, " ")}` : "done event received");
  } else {
    const data = await chat.json().catch(() => ({}));
    // No AI credentials configured → clean 400 explaining what's missing.
    check("POST /api/chat responds cleanly without AI key",
      chat.status === 400 && /api key|chatgpt|provider/i.test(String(data.error)),
      `${chat.status}: ${data.error}`);
  }

  // 13. Cross-user boundaries
  const foreign = await req(`/api/campaigns/${campaignId}`, {}, sessionB);
  check("other user's campaign → 404", foreign.status === 404, String(foreign.status));
  const foreignOracle = await req("/api/oracle", json({ sceneId, kind: "FateChart" }), sessionB);
  check("other user's scene → 404", foreignOracle.status === 404, String(foreignOracle.status));
  const foreignTable = await req(`/api/tables/${customId}`, { method: "DELETE" }, sessionB);
  check("other user cannot delete your table", foreignTable.status === 200); // deleteMany = no-op
  const tableStillThere = await req("/api/tables", {}, sessionA);
  check("table survived foreign delete", tableStillThere.data?.custom?.some((t: any) => t.id === customId));

  // 14. Cleanup
  const delTable = await req(`/api/tables/${customId}`, { method: "DELETE" }, sessionA);
  check("DELETE custom table", delTable.status === 200);
  const del = await req(`/api/campaigns/${campaignId}`, { method: "DELETE" }, sessionA);
  check("DELETE campaign", del.status === 200, JSON.stringify(del.data));
}

main()
  .catch((error) => {
    failures++;
    console.error("  ✘ smoke-api crashed:", error);
  })
  .finally(async () => {
    await prisma.customTable.deleteMany({ where: { name: { in: ["Train cargo", "Bad bands"] } } }).catch(() => undefined);
    await prisma.campaign.deleteMany({ where: { name: "API Smoke Campaign" } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } }).catch(() => undefined);
    await prisma.$disconnect();
    console.log(failures === 0 ? "\n✅ smoke-api: all checks passed" : `\n❌ smoke-api: ${failures} failure(s)`);
    process.exit(failures === 0 ? 0 : 1);
  });
