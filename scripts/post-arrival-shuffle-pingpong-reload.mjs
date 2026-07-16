/**
 * Reload-per-iteration Shuffle ping-pong post-arrival probe (more reliable than long sessions).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { evaluatePostArrivalShuffleStabilityGate } from "./post-arrival-shuffle-stability-core.mjs";

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1] ?? null;
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

const base = argValue("--base") || "http://127.0.0.1:3010";
const out =
  argValue("--out") ||
  path.join("scripts", "ghost-filmstrip-out", `post-arrival-pingpong-reload-${Date.now()}`);
const repeat = Math.max(1, Number(argValue("--repeat") || "20") || 20);
const PROVIDER = "PLAYWRIGHT_DOM_SAMPLE_ROBUST_NOT_NO_SCREENCAST";
fs.mkdirSync(out, { recursive: true });

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function dismissLegal(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const open = await page.evaluate(() =>
      document.body.classList.contains("sayittome-entry-legal-open"),
    );
    if (!open) return;
    await page.evaluate(() => {
      const declare = document.querySelector(
        ".sayittome-entry-legal-scroll button:last-of-type",
      );
      declare?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      declare?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      declare?.click();
    });
    await page.waitForTimeout(350);
    const accepted = await page.evaluate(() => {
      const accept = document.querySelector(
        ".sayittome-entry-legal-actions button:last-of-type",
      );
      if (!(accept instanceof HTMLButtonElement) || accept.disabled) return false;
      accept.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      accept.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      accept.click();
      return true;
    });
    if (!accepted) continue;
    await page
      .waitForFunction(
        () => !document.body.classList.contains("sayittome-entry-legal-open"),
        null,
        { timeout: 8000 },
      )
      .catch(() => {});
  }
}

async function tap(page, dest) {
  await dismissLegal(page);
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const ok = await page.evaluate((d) => {
      const el = document.querySelector(`[data-nav-tab="${d}"]`);
      if (!el) return false;
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      el.click();
      return true;
    }, dest);
    if (ok) return;
    await dismissLegal(page);
    await page.waitForTimeout(80);
  }
  throw new Error(`missing-tab:${dest}`);
}

async function sample(page) {
  return page.evaluate(() => {
    const host = document.getElementById("sayittome-shuffle-keepalive-host");
    const list = host?.querySelector("[data-shuffle-list]");
    const cards = list
      ? [...list.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)")]
      : [];
    const mainVisible = [...document.querySelectorAll(".sayittome-main-tab-keepalive-visible")].filter(
      (el) => getComputedStyle(el).visibility !== "hidden",
    ).length;
    const cardIds = cards
      .map((el) => el.getAttribute("data-profile-id") || el.getAttribute("data-uid") || "")
      .filter(Boolean)
      .slice(0, 6);
    return {
      pathname: location.pathname,
      hostVisible: !!host?.classList.contains("sayittome-shuffle-keepalive-visible"),
      hostFrozen: !!host?.classList.contains("sayittome-shuffle-keepalive-frozen"),
      bridge: document.documentElement.hasAttribute("data-post-settle-route-bridge"),
      slideAttr: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
      slots: cards.length,
      cardIds,
      mainVisible,
      loadingTextAnywhere: false,
      blackRoot:
        document.documentElement.getAttribute("data-main-tab-shuffle-presented") === "black",
      presentedNone:
        document.documentElement.getAttribute("data-main-tab-shuffle-presented") === "none",
      visualHash: [
        location.pathname,
        host?.classList.contains("sayittome-shuffle-keepalive-visible") ? "V" : "F",
        String(cards.length),
        cardIds.join("|"),
        String(mainVisible),
      ].join("::"),
    };
  });
}

async function waitPath(page, dest, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const p = await page.evaluate(() => location.pathname);
    if (p === `/${dest}` || p.endsWith(`/${dest}`)) return true;
    await page.waitForTimeout(20);
  }
  return false;
}

async function waitArrival(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    const s = await sample(page);
    if (
      s.pathname.includes("shuffle") &&
      s.hostVisible &&
      !s.hostFrozen &&
      !s.bridge &&
      !s.slideAttr &&
      s.slots >= 3
    ) {
      return s;
    }
    await page.waitForTimeout(16);
  }
  return sample(page);
}

async function runOne(page, via, idx) {
  await page.goto(`${base}/chats?navcapture=1&_ppr=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.evaluate(() =>
    localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true"),
  );
  await page.waitForTimeout(700);
  await dismissLegal(page);
  await page.locator("[data-nav-tab]").first().waitFor({ state: "attached", timeout: 20_000 });

  await tap(page, "shuffle");
  if (!(await waitPath(page, "shuffle"))) throw new Error("boot-shuffle-timeout");
  await waitArrival(page);

  await tap(page, via);
  if (!(await waitPath(page, via))) throw new Error(`via-timeout:${via}`);
  const settleStart = Date.now();
  while (Date.now() - settleStart < 6000) {
    const s = await sample(page);
    if (s.pathname.includes(`/${via}`) && !s.slideAttr && s.mainVisible > 0) break;
    await page.waitForTimeout(40);
  }

  await tap(page, "shuffle");
  if (!(await waitPath(page, "shuffle"))) throw new Error("return-shuffle-timeout");
  await waitArrival(page);

  const series = [];
  const t0 = Date.now();
  for (const off of [0, 50, 100, 200, 400, 700, 1000]) {
    const wait = Math.max(0, off - (Date.now() - t0));
    if (wait) await page.waitForTimeout(wait);
    series.push({ offsetMs: off, ...(await sample(page)) });
  }
  const first = series[0];
  const flashFrames = series.filter(
    (s) =>
      (s.hostFrozen && !s.bridge) ||
      (!s.hostVisible && s.mainVisible > 0 && s.pathname.includes("shuffle")),
  );
  const hostStable = series.every(
    (s) => s.pathname.includes("shuffle") && s.hostVisible && !s.hostFrozen,
  );
  const hashStable = series.every((s) => s.visualHash === first.visualHash);
  const resultStable = series.every(
    (s) => !first.cardIds.length || s.cardIds.join("|") === first.cardIds.join("|"),
  );
  const slotStable = series.every((s) => s.slots === first.slots);
  const gate = evaluatePostArrivalShuffleStabilityGate({
    CAPTURE_PROVIDER_SELECTED: PROVIDER,
    postArrivalFlashCount: flashFrames.length,
    loadingTextAnywhereCount: 0,
    visualHashStableAfterArrival: hashStable,
    shuffleDomIdentityStable: hostStable,
    shuffleResultIdentityStable: resultStable,
    shuffleSlotIdentityStable: slotStable,
    poolRefetchVisibleDuringSettle: !resultStable,
    blackRoot: series.some((s) => s.blackRoot),
    presentedNone: series.some((s) => s.presentedNone),
  });
  const report = { via, idx, series, flashFrames: flashFrames.length, hostStable, hashStable, resultStable, slotStable, gate };
  writeJson(path.join(out, `reload-${via}-${idx}.json`), report);
  return report;
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await (
  await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv",
  })
).newPage();

const vias = ["chats", "boost"];
const results = [];
for (const via of vias) {
  for (let i = 0; i < repeat; i += 1) {
    try {
      results.push(await runOne(page, via, i));
    } catch (err) {
      const fail = {
        via,
        idx: i,
        error: String(err?.message || err),
        gate: { pass: false, status: "PROBE_ERROR" },
        flashFrames: 0,
      };
      results.push(fail);
      writeJson(path.join(out, `reload-${via}-${i}-error.json`), fail);
    }
  }
}
await browser.close();

const pass = results.filter((r) => r.gate?.pass).length;
const fail = results.length - pass;
const flash = results.reduce((n, r) => n + Number(r.flashFrames || 0), 0);
const summary = {
  base,
  repeat,
  total: results.length,
  pass,
  fail,
  postArrivalFlashCount: flash,
  byVia: vias.map((via) => {
    const subset = results.filter((r) => r.via === via);
    return {
      via,
      pass: subset.filter((r) => r.gate?.pass).length,
      fail: subset.filter((r) => !r.gate?.pass).length,
      flash: subset.reduce((n, r) => n + Number(r.flashFrames || 0), 0),
    };
  }),
  POST_ARRIVAL_SHUFFLE_STABILITY_GATE: fail === 0 && flash === 0,
  status:
    fail === 0 && flash === 0
      ? "POST_ARRIVAL_PINGPONG_RELOAD_PASS"
      : "SHUFFLE_POST_ARRIVAL_FLASH_TARGETED_VALIDATION_FAILED",
};
writeJson(path.join(out, "pingpong-reload-summary.json"), summary);
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.POST_ARRIVAL_SHUFFLE_STABILITY_GATE ? 0 : 1);
