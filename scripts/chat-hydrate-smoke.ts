/**
 * Verify chat history hydration survives leaving and coming back.
 * Target: persist-test campaign seeded with 2 ChatTurns.
 */
import { chromium } from "playwright";

const BASE = process.env.API_BASE ?? "https://rpg.brunorocha.dev.br";
const CAM = "cmuc5b7xm000qd4chh1i7uz4c";
const EMAIL = "smoke-ui-1790049587374@test.local";
const PASS = "Sup3rSecret!";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|campaigns/, { timeout: 20000 });
  console.log("logged in");

  // Open campaign, Story tab is default
  await page.goto(`${BASE}/campaigns/${CAM}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  let body = (await page.textContent("body")) ?? "";
  console.log(`  first visit — chat has seeded user turn: ${body.includes("I light the torch")}`);
  console.log(`  first visit — chat has seeded GM turn: ${body.includes("Ancient Chamber")}`);

  // Leave and come back
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.goto(`${BASE}/campaigns/${CAM}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  body = (await page.textContent("body")) ?? "";
  console.log(`  after nav away+back — user turn visible: ${body.includes("I light the torch")}`);
  console.log(`  after nav away+back — GM turn visible: ${body.includes("Ancient Chamber")}`);

  // Hard reload
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  body = (await page.textContent("body")) ?? "";
  console.log(`  after hard reload — user turn visible: ${body.includes("I light the torch")}`);
  console.log(`  after hard reload — GM turn visible: ${body.includes("Ancient Chamber")}`);

  await browser.close();
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
