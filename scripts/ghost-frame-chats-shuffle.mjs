/**
 * Warm Chats → Shuffle ghost-frame check (dev/trace only).
 * Usage: NEXT_PUBLIC_NAV_TRACE=1 npm run dev -- -p 3456
 *        node scripts/ghost-frame-chats-shuffle.mjs --base http://localhost:3456
 */

import { chromium } from "playwright";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3456";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function ghostStats() {
  return page.evaluate(() => {
    const api = window.__sayittomeGhostFrame;
    if (!api) return { error: "trace-disabled" };
    return api.export();
  });
}

try {
  await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  await page.goto(`${base}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    window.__sayittomeGhostFrame?.reset();
    window.__sayittomeShuffleVisualCommits?.reset();
  });

  const shuffleControl = page.locator('[data-nav-tab="shuffle"]').first();
  await shuffleControl.waitFor({ state: "visible", timeout: 15000 });
  await shuffleControl.dispatchEvent("pointerdown");
  await shuffleControl.click();
  await page.waitForURL(/\/shuffle/, { timeout: 15000 });
  await page.waitForTimeout(800);

  const stats = await ghostStats();
  const commits = await page.evaluate(() =>
    window.__sayittomeShuffleVisualCommits?.export?.() ?? [],
  );

  console.log(
    JSON.stringify(
      {
        base,
        ghostFrame: stats,
        visualCommits: commits,
        pathname: page.url(),
        loadingShellVisible: await page
          .locator("[data-loading-shell]")
          .isVisible()
          .catch(() => false),
        shufflePrimaryVisible: await page
          .locator("[data-nav-shuffle-primary], [data-shuffle-list]")
          .first()
          .isVisible()
          .catch(() => false),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
