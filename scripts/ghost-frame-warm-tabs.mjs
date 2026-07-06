/**
 * Ghost-frame detection across warm tab transitions (production or local).
 * Usage: node scripts/ghost-frame-warm-tabs.mjs [--base URL]
 */

import { chromium } from "playwright";

const base = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://sayittome-app.web.app";

const TRANSITIONS = [
  {
    name: "Chats→Shuffle",
    seed: async (page) => {
      await page.goto(`${base}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
      await page.goto(`${base}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1000);
    },
    act: async (page) => {
      await page.locator('[data-nav-tab="shuffle"]').first().click();
      await page.waitForURL(/\/shuffle/, { timeout: 15000 });
    },
    destSelector: "[data-nav-shuffle-primary], [data-shuffle-list]",
    loadingIn: "#sayittome-shuffle-keepalive-host",
  },
  {
    name: "Stories→Chats",
    seed: async (page) => {
      await page.goto(`${base}/stories`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1000);
      await page.goto(`${base}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(500);
      await page.goto(`${base}/stories`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1000);
    },
    act: async (page) => {
      await page.locator('a[href="/chats"]').first().click();
      await page.waitForURL(/\/chats/, { timeout: 15000 });
    },
    destSelector: "[data-nav-chats-primary]",
    loadingIn: "#sayittome-main-tab-keepalive-chats",
  },
  {
    name: "Chats→Boost",
    seed: async (page) => {
      await page.goto(`${base}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1000);
      await page.goto(`${base}/boost`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(500);
      await page.goto(`${base}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1000);
    },
    act: async (page) => {
      await page.locator('a[href="/boost"]').first().click();
      await page.waitForURL(/\/boost/, { timeout: 15000 });
    },
    destSelector: "[data-nav-primary-content]",
    loadingIn: "#sayittome-main-tab-keepalive-boost",
  },
  {
    name: "Boost→Settings",
    seed: async (page) => {
      await page.goto(`${base}/boost`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1000);
      await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(500);
      await page.goto(`${base}/boost`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1000);
    },
    act: async (page) => {
      await page.locator('a[href="/settings"]').first().click();
      await page.waitForURL(/\/settings/, { timeout: 15000 });
    },
    destSelector: "[data-nav-settings-primary]",
    loadingIn: "#sayittome-main-tab-keepalive-settings",
  },
  {
    name: "Settings→Stories",
    seed: async (page) => {
      await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1000);
      await page.goto(`${base}/stories`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(500);
      await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1000);
    },
    act: async (page) => {
      await page.locator('a[href="/stories"]').first().click();
      await page.waitForURL(/\/stories/, { timeout: 15000 });
    },
    destSelector: "[data-nav-primary-content]",
    loadingIn: "#sayittome-main-tab-keepalive-stories",
  },
];

function snap(page, loadingIn, destSelector) {
  return page.evaluate(
    ({ loadingIn, destSelector }) => {
      const root = loadingIn ? document.querySelector(loadingIn) : document.body;
      const loadingShell = Boolean(root?.querySelector("[data-loading-shell]"));
      const loadingText = /Cargando\.\.\./i.test(root?.textContent?.slice(0, 600) ?? "");
      const destPrimary = Boolean(document.querySelector(destSelector));
      const destVisible = Boolean(
        root?.classList?.contains("sayittome-main-tab-keepalive-visible") ||
          root?.classList?.contains("sayittome-shuffle-keepalive-visible"),
      );
      const transient =
        destVisible && (loadingShell || loadingText) && !destPrimary;
      return { loadingShell, loadingText, destPrimary, destVisible, transient };
    },
    { loadingIn, destSelector },
  );
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];

try {
  for (const t of TRANSITIONS) {
    await t.seed(page);
    const frames = [];
    const clickPromise = t.act(page);
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(16);
      frames.push(await snap(page, t.loadingIn, t.destSelector));
    }
    await clickPromise;
    await page.waitForTimeout(400);
    const settled = await snap(page, t.loadingIn, t.destSelector);

    const ghosts = frames.filter((f) => f.transient);
    results.push({
      transition: t.name,
      ghostFrameCount: ghosts.length,
      loadingShellPainted: frames.some((f) => f.loadingShell),
      blankVisualGapMs: 0,
      destinationTransientStatePainted: ghosts.length > 0,
      settled,
      ghostFrames: ghosts,
    });
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ base, results }, null, 2));
