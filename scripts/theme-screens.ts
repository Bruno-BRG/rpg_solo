/**
 * Visual check: capture light and dark theme screenshots.
 */
import { chromium } from "playwright";

const BASE = process.env.API_BASE ?? "https://rpg.brunorocha.dev.br";
const EMAIL = "smoke-ui-1790049587374@test.local";
const PASS = "Sup3rSecret!";
const CAM = "cmuc5b7xm000qd4chh1i7uz4c";
const OUT = process.env.OUT ?? "screenshots";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|campaigns/, { timeout: 20000 });

  // Light
  await page.evaluate(() => { localStorage.setItem("theme", "light"); document.documentElement.classList.remove("dark"); });
  await page.reload({ waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/dashboard-light.png`, fullPage: false });

  await page.goto(`${BASE}/campaigns/${CAM}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/campaign-light.png` });

  // Dark
  await page.evaluate(() => { localStorage.setItem("theme", "dark"); document.documentElement.classList.add("dark"); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/campaign-dark.png` });

  await page.click('button:has-text("Oracle")');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/oracle-dark.png` });

  await page.click('button:has-text("Threads & Cast")');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/threads-dark.png` });

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/dashboard-dark.png` });

  await browser.close();
  console.log("screenshots saved");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
