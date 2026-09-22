/** Check /api/ai/models response for the smoke UI user. */
import { chromium } from "playwright";

const BASE = process.env.API_BASE ?? "https://rpg.brunorocha.dev.br";
const EMAIL = "smoke-ui-1790049587374@test.local";
const PASS = "Sup3rSecret!";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|campaigns/, { timeout: 20000 });

  const res = await page.evaluate(async () => {
    const r = await fetch("/api/ai/models");
    return { status: r.status, body: await r.text() };
  });
  console.log("status:", res.status);
  console.log("body:", res.body.slice(0, 500));
  await browser.close();
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
