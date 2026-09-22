/** Screenshot the new campaign Settings tab. */
import { chromium } from "playwright";

const BASE = process.env.API_BASE ?? "https://rpg.brunorocha.dev.br";
const EMAIL = "smoke-ui-1790049587374@test.local";
const PASS = "Sup3rSecret!";
const CAM = "cmuc5b7xm000qd4chh1i7uz4c";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })).newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|campaigns/, { timeout: 20000 });

  await page.goto(`${BASE}/campaigns/${CAM}`, { waitUntil: "networkidle" });
  await page.evaluate(() => { localStorage.setItem("theme", "dark"); document.documentElement.classList.add("dark"); });
  await page.click('button:has-text("Settings")');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screens/settings-dark.png" });
  await browser.close();
  console.log("saved");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
