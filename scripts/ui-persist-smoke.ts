/**
 * UI persistence smoke — verifies that campaign data survives
 * leaving the page and coming back (the reported bug).
 * Run: npx tsx scripts/ui-persist-smoke.ts
 */
import { chromium } from "playwright";

const BASE = process.env.API_BASE ?? "https://rpg.brunorocha.dev.br";
const stamp = Date.now();
const email = `smoke-ui-${stamp}@test.local`;
const pass = "Sup3rSecret!";

const checks: string[] = [];
function check(name: string, ok: boolean, extra = "") {
  checks.push(`${ok ? "✔" : "✘"} ${name}${ok ? "" : " — " + extra}`);
  console.log(`  ${ok ? "✔" : "✘"} ${name}${ok ? "" : ` — ${extra}`}`);
}

async function main() {
  const reg = await fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass, name: "UI Smoke" }),
  });
  console.log("register:", reg.status);
  if (!reg.ok) throw new Error(await reg.text());

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

  // Login through the UI
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|campaigns/, { timeout: 20000 });
  console.log("logged in →", page.url());

  // Create campaign + resources via API (using the browser's cookies)
  const cookieHeader = await ctx.cookies().then((c) =>
    c.map((k) => `${k.name}=${k.value}`).join("; "),
  );
  const headers = { "Content-Type": "application/json", Cookie: cookieHeader };

  const cam = await fetch(`${BASE}/api/campaigns`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: `persist-test-${stamp}`, genre: "scifi" }),
  });
  const camData = await cam.json();
  const campaignId = camData.campaign?.id;
  check("campaign created", !!campaignId, JSON.stringify(camData));
  if (!campaignId) throw new Error("no campaign id");

  const t = await fetch(`${BASE}/api/campaigns/${campaignId}/story`, {
    method: "POST",
    headers,
    body: JSON.stringify({ resource: "threads", summary: "Persisted Thread XYZ", tension: 2 }),
  });
  check("thread POST 201", t.status === 201, `${t.status} ${await t.text()}`);

  const c = await fetch(`${BASE}/api/campaigns/${campaignId}/story`, {
    method: "POST",
    headers,
    body: JSON.stringify({ resource: "cast", name: "Persisted Cast ABC", stance: "Hostile" }),
  });
  check("cast POST 201", c.status === 201, `${c.status}`);

  const s = await fetch(`${BASE}/api/campaigns/${campaignId}/story`, {
    method: "POST",
    headers,
    body: JSON.stringify({ resource: "scenes", title: "Persisted Scene QWE" }),
  });
  check("scene POST 201", s.status === 201, `${s.status}`);

  const ch = await fetch(`${BASE}/api/campaigns/${campaignId}/characters`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Persisted Hero ZXC" }),
  });
  check("character POST 201", ch.status === 201, `${ch.status} ${await ch.text()}`);

  // ── Visit workspace and check each tab renders the data
  await page.goto(`${BASE}/campaigns/${campaignId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const sectionText = () => page.textContent("section").then((s) => s ?? "");

  await page.click('button:has-text("Threads & Cast")');
  await page.waitForTimeout(1200);
  let txt = await sectionText();
  check("threads visible before reload", txt.includes("Persisted Thread XYZ"));
  check("cast visible before reload", txt.includes("Persisted Cast ABC"));
  check("scene visible before reload", txt.includes("Persisted Scene QWE"));

  await page.click('button:has-text("Party")');
  await page.waitForTimeout(1200);
  txt = await sectionText();
  check("character visible before reload", txt.includes("Persisted Hero ZXC"));

  // ── Simulate leaving and coming back
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/campaigns/${campaignId}`, { waitUntil: "networkidle" });

  await page.click('button:has-text("Threads & Cast")');
  await page.waitForTimeout(1200);
  txt = await sectionText();
  check("threads visible after nav away+back", txt.includes("Persisted Thread XYZ"));
  check("cast visible after nav away+back", txt.includes("Persisted Cast ABC"));

  await page.click('button:has-text("Party")');
  await page.waitForTimeout(1200);
  txt = await sectionText();
  check("character visible after nav away+back", txt.includes("Persisted Hero ZXC"));

  // ── Full reload (new navigation to the URL)
  await page.reload({ waitUntil: "networkidle" });
  await page.click('button:has-text("Threads & Cast")');
  await page.waitForTimeout(1200);
  txt = await sectionText();
  check("threads visible after hard reload", txt.includes("Persisted Thread XYZ"));

  console.log("\n=== SUMMARY ===");
  const failed = checks.filter((c) => c.startsWith("✘"));
  console.log(failed.length === 0 ? "✅ all checks passed" : `❌ ${failed.length} failed`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
