/** Verify the model dropdown populates (wait for options). */
import { chromium } from "playwright";

const BASE = process.env.API_BASE ?? "https://rpg.brunorocha.dev.br";
const EMAIL = "smoke-ui-1790049587374@test.local";
const PASS = "Sup3rSecret!";
const CAM = "cmuc5b7xm000qd4chh1i7uz4c";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|campaigns/, { timeout: 20000 });

  await page.goto(`${BASE}/campaigns/${CAM}`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Settings")');
  // Wait until the select has more than one option (catalog loaded).
  await page.waitForFunction(
    () => document.querySelectorAll("select option").length > 1,
    { timeout: 15000 },
  );
  const options = await page.$$eval("select option", (os) => os.map((o) => o.textContent));
  console.log("options:", JSON.stringify(options, null, 2));
  await browser.close();
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
