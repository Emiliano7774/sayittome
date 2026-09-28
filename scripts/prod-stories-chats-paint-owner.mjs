/**
 * Production mobile/touch paint-ownership E2E for Stories↔Chats.
 * Direct cold /stories and /chats; asserts elementFromPoint + route-shell empty
 * and destination panel at y≈0 after 300ms / 1.5s / 5s.
 *
 * Usage:
 *   node scripts/prod-stories-chats-paint-owner.mjs
 *   node scripts/prod-stories-chats-paint-owner.mjs --base https://sayittome-app.web.app
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const base =
  (baseIdx >= 0 ? args[baseIdx + 1] : null) ||
  process.env.SAYITTOME_HOSTING_ORIGIN ||
  "https://sayittome-app.web.app";

const CHROME =
  process.env.PLAYWRIGHT_CHROME ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function snap(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".sayittome-route-shell");
    const ss = shell ? getComputedStyle(shell) : null;
    const sr = shell?.getBoundingClientRect();
    const cx = Math.floor(innerWidth / 2);
    const cy = Math.min(Math.floor(innerHeight / 2), 400);
    const top = document.elementFromPoint(cx, cy);
    const chain = [];
    let e = top;
    while (e && chain.length < 10) {
      chain.push({
        tag: e.tagName,
        id: e.id || "",
        cls: String(e.className || "").slice(0, 160),
      });
      e = e.parentElement;
    }
    const visible = [...document.querySelectorAll(".sayittome-main-tab-keepalive-visible")].map(
      (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          id: el.id,
          y: r.y,
          h: r.height,
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
        };
      },
    );
    return {
      path: location.pathname,
      bar: document.documentElement.getAttribute("data-sayittome-bar-target"),
      kind: document.documentElement.getAttribute("data-sayittome-route-kind"),
      shell: {
        children: shell?.children?.length ?? 0,
        display: ss?.display ?? null,
        visibility: ss?.visibility ?? null,
        opacity: ss?.opacity ?? null,
        pointer: ss?.pointerEvents ?? null,
        h: sr?.height ?? 0,
        y: sr?.y ?? 0,
        text: (shell?.textContent || "").trim().slice(0, 80),
      },
      visible,
      topChain: chain,
    };
  });
}

function assertPaintOwner(label, state, dest) {
  const destId = `sayittome-main-tab-keepalive-${dest}`;
  assert.equal(state.path, `/${dest}`, `${label}: pathname`);
  assert.equal(state.bar, dest, `${label}: bar-target`);
  const panel = state.visible.find((v) => v.id === destId);
  assert.ok(panel, `${label}: destination panel visible class`);
  assert.ok(panel.y < 80, `${label}: destination y≈0 got ${panel.y}`);
  assert.ok(panel.h > 200, `${label}: destination height`);

  const shellHidden =
    state.shell.children === 0 ||
    state.shell.display === "none" ||
    state.shell.visibility === "hidden" ||
    Number(state.shell.opacity || "1") < 0.05 ||
    state.shell.h < 8;
  assert.ok(
    shellHidden,
    `${label}: route-shell must not own paint (children=${state.shell.children} display=${state.shell.display} h=${state.shell.h} text=${JSON.stringify(state.shell.text)})`,
  );

  const inDest = state.topChain.some((n) => n.id === destId);
  const inShell = state.topChain.some((n) =>
    String(n.cls || "").includes("sayittome-route-shell"),
  );
  assert.equal(inShell, false, `${label}: elementFromPoint must not hit route-shell`);
  assert.equal(inDest, true, `${label}: elementFromPoint must hit destination keepalive`);
}

async function hop(page, from, to) {
  await page.goto(`${base}${from}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForFunction(
    (tab) => !!document.querySelector(`[data-nav-tab="${tab}"]`),
    to,
    { timeout: 25000 },
  );
  // Let keep-alive settle after cold boot.
  await page.waitForTimeout(2500);
  const before = await snap(page);
  assert.equal(before.path, from, `cold boot ${from}`);

  await page.locator(`[data-nav-tab="${to}"]`).last().tap();

  for (const wait of [300, 1500, 5000]) {
    if (wait === 300) await page.waitForTimeout(300);
    else if (wait === 1500) await page.waitForTimeout(1200);
    else await page.waitForTimeout(3500);
    const state = await snap(page);
    assertPaintOwner(`${from}->/${to}@${wait}ms`, state, to);
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
});
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2.75,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36",
});
await context.addInitScript(() => {
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    isPluginAvailable: () => false,
    Plugins: {},
  };
  localStorage.setItem("sayittome_locale_prompt_done", "1");
  localStorage.setItem("sayittome_locale", "es");
});
const page = await context.newPage();

try {
  await hop(page, "/stories", "chats");
  await hop(page, "/chats", "stories");

  // Rapid alternating from cold /stories
  await page.goto(`${base}/stories`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForFunction(() => !!document.querySelector('[data-nav-tab="chats"]'), {
    timeout: 25000,
  });
  await page.waitForTimeout(2000);
  for (const dest of ["chats", "stories", "chats", "stories"]) {
    await page.locator(`[data-nav-tab="${dest}"]`).last().tap();
    await page.waitForTimeout(400);
    const state = await snap(page);
    assertPaintOwner(`rapid->${dest}`, state, dest);
  }

  console.log(
    JSON.stringify({
      gate: "PROD_STORIES_CHATS_PAINT_OWNER",
      pass: true,
      base,
    }),
  );
} finally {
  await browser.close();
}
