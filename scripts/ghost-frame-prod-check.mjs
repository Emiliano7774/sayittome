/**
 * Production warm Chats → Shuffle behavioral ghost check (no trace API required).
 * Usage: node scripts/ghost-frame-prod-check.mjs
 */

import { chromium } from "playwright";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://sayittome-app.web.app";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

function snap(label) {
  return page.evaluate((phase) => {
    const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
    const chatsHost = document.getElementById("sayittome-main-tab-keepalive-chats");
    const shuffleVisible = shuffleHost?.classList.contains("sayittome-shuffle-keepalive-visible");
    const chatsVisible = chatsHost?.classList.contains("sayittome-main-tab-keepalive-visible");
    const loadingShell = Boolean(document.querySelector("[data-loading-shell]"));
    const shufflePrimary = Boolean(
      document.querySelector("[data-nav-shuffle-primary], [data-shuffle-list]"),
    );
    const loadingText = /Cargando\.\.\./i.test(
      shuffleHost?.textContent?.slice(0, 500) ?? "",
    );
    return {
      phase,
      pathname: location.pathname,
      shuffleVisible,
      chatsVisible,
      loadingShell,
      loadingText,
      shufflePrimary,
    };
  }, label);
}

try {
  await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  const onShuffle = await snap("shuffle-seeded");

  await page.goto(`${base}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const onChats = await snap("chats-before");

  const shuffleControl = page.locator('[data-nav-tab="shuffle"]').first();
  await shuffleControl.waitFor({ state: "visible", timeout: 15000 });
  await shuffleControl.click();

  const frames = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(16);
    frames.push(await snap(`frame-${i}`));
  }

  await page.waitForURL(/\/shuffle/, { timeout: 15000 });
  await page.waitForTimeout(500);
  const settled = await snap("shuffle-settled");

  const ghostFrames = frames.filter(
    (f) =>
      f.shuffleVisible &&
      (f.loadingShell || f.loadingText) &&
      !f.shufflePrimary,
  );

  console.log(
    JSON.stringify(
      {
        base,
        onShuffle,
        onChats,
        ghostFrameCount: ghostFrames.length,
        ghostFrames,
        settled,
        loadingShellPainted: frames.some((f) => f.shuffleVisible && f.loadingShell),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
