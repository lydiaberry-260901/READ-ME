// Takes screenshots of pages as a demo user, for design review. Development only.
// Usage: npx tsx scripts/screenshots.ts <demo email> <output folder> /path1 /path2 ...
import { chromium } from "playwright-core";

async function main() {
  const [email, outDir, ...paths] = process.argv.slice(2);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(120_000);
  await page.goto(`${base}/signin`);
  await page.getByRole("button", { name: new RegExp(email.replace(/[.]/g, "\\."), "i") }).click();
  await page.waitForURL(`${base}/`);
  for (const p of paths) {
    await page.goto(`${base}${p}`, { waitUntil: "load" });
    await page.waitForTimeout(1500); // let chart animations finish
    const file = `${outDir}/${p.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`;
    await page.screenshot({ path: file, fullPage: process.env.FULL_PAGE === "1" });
    console.log(file);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
