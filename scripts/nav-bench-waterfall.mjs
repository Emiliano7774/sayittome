/**
 * Detailed waterfall for shuffle → profile (cached warm + cold).
 * Build with NEXT_PUBLIC_NAV_TRACE=1, start server, then:
 *   node scripts/nav-bench-waterfall.mjs --base http://localhost:3002 --warm 7
 */

import { chromium, devices } from "playwright";
import fs from "node:fs";

const baseUrl = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3002";
const warmRuns = Number(process.argv[process.argv.indexOf("--warm") + 1] || 7);
const outFile = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "scripts/nav-bench-waterfall-results.json";

function pdMs(sample) {
  if (typeof sample.phaseDeltas?.["pointerdown→useful-paint"] === "number") {
    return sample.phaseDeltas["pointerdown→useful-paint"];
  }
  if (
    typeof sample.phases?.pointerdown === "number" &&
    typeof sample.phases?.["useful-paint"] === "number"
  ) {
    return sample.phases["useful-paint"] - sample.phases.pointerdown;
  }
  return null;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function pickClosest(samples, targetMs) {
  return samples.reduce((best, sample) => {
    const ms = pdMs(sample);
    if (ms == null) return best;
    if (!best) return sample;
    const bestMs = pdMs(best);
    if (bestMs == null) return sample;
    return Math.abs(ms - targetMs) < Math.abs(bestMs - targetMs) ? sample : best;
  }, null);
}

function waterfallLines(sample) {
  const p = sample.phases || {};
  const d = sample.detailPhases || {};
  const line = (label, key, source = p) => {
    const val = source[key];
    return typeof val === "number" ? `${label}: ${Math.round(val)} ms` : `${label}: —`;
  };

  return [
    line("pointerdown", "pointerdown"),
    line("click", "click"),
    line("nav-start", "nav-start"),
    line("pathname changed", "pathname-changed", d),
    line("profile component mount", "profile-mount", d),
    line("profile cache hit", "profile-cache-hit", d),
    line("profile cache miss", "profile-cache-miss", d),
    line("profile lookup started", "profile-lookup-started", d),
    line("profile fetch emitted", "profile-fetch-emitted", d),
    line("profile fetch response", "profile-fetch-response", d),
    line("profile normalized", "profile-profile-normalized", d),
    line("profile state ready", "profile-state-ready", d),
    line("set profile", "profile-set-profile", d),
    line("loading false", "profile-loading-false", d),
    line("dest-layout", "dest-layout"),
    line("main profile element in DOM", "dom-main-visible", d),
    line("useful-paint mark", "useful-paint"),
    typeof sample.usefulPaintLagMs === "number"
      ? `useful-paint lag vs DOM: ${sample.usefulPaintLagMs} ms`
      : "useful-paint lag vs DOM: —",
    typeof sample.commitsBeforeUsefulPaint === "number"
      ? `commits before useful-paint: ${sample.commitsBeforeUsefulPaint}`
      : null,
    sample.aborted ? `aborted: ${sample.aborted}` : null,
  ].filter(Boolean);
}

async function prep(page) {
  await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem("sayittome:nav-trace", "1");
    localStorage.setItem("sayittome_locale_prompt_done", "1");
    localStorage.setItem(
      "sayittome-chat-notification-prefs",
      JSON.stringify({ enabled: false, prompted: true }),
    );
    sessionStorage.setItem("sayittome_anon_legal_accepted_v1", "1");
    sessionStorage.setItem("sayittome:shuffle:legal-unlocked:v1", "1");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(
    "[data-scroll-root].sayittome-shuffle-scroll-classic button[data-action=\"profile\"][data-username]",
    { timeout: 90000 },
  );
}

function shuffleProfile(page, username) {
  const selector = username
    ? `button[data-action="profile"][data-username="${username}"]`
    : "button[data-action=\"profile\"][data-username]";
  return page
    .locator(
      `[data-scroll-root].sayittome-shuffle-scroll-classic ${selector}`,
    )
    .first();
}

async function measure(page, pathId, cold, runIndex, action) {
  await page.evaluate(
    ({ pathId, cold, runIndex }) => window.__sayittomeNavTrace.begin(pathId, cold, runIndex),
    { pathId, cold, runIndex },
  );
  await page.evaluate(() => window.__sayittomeNavTrace.mark("pointerdown"));
  await action();
  await page.evaluate(() => window.__sayittomeNavTrace.mark("click"));

  await page.waitForFunction(
    (pid) => {
      const { samples } = window.__sayittomeNavTrace.export();
      return samples.some((s) => s.pathId === pid && typeof s.phases?.["useful-paint"] === "number");
    },
    pathId,
    { timeout: cold ? 15000 : 45000 },
  );

  const payload = await page.evaluate((pid) => {
    const { samples } = window.__sayittomeNavTrace.export();
    const sample = samples.filter((s) => s.pathId === pid).at(-1);
    const pipeline = window.__sayittomeProfilePipeline?.snapshot?.() || null;
    return { sample, pipeline, url: location.href };
  }, pathId);

  return payload;
}

async function clearProfileCache(page, username) {
  await page.evaluate((user) => {
    window.__sayittomeProfileCache?.clear?.(user);
    window.__sayittomeProfileCache?.clear?.();
  }, username);
}

const browser = await chromium.launch({ headless: true });
const all = [];

// Warm cached: seed cache then measure
{
  const context = await browser.newContext({ ...devices["Pixel 5"], locale: "es-AR" });
  const page = await context.newPage();
  await prep(page);
  const pinnedUsername = await shuffleProfile(page).getAttribute("data-username");
  await shuffleProfile(page, pinnedUsername).click({ force: true });
  await page.waitForURL(/\/u\//, { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const snap = window.__sayittomeProfilePipeline?.snapshot?.();
      return Boolean(snap?.phases?.["set-profile"] || snap?.phases?.["cache-hit"]);
    },
    { timeout: 20000 },
  );
  await page.goBack({ waitUntil: "domcontentloaded" });
  await shuffleProfile(page, pinnedUsername).waitFor({ state: "visible", timeout: 30000 });

  for (let i = 0; i < warmRuns; i++) {
    try {
      const payload = await measure(page, "shuffle→profile-cached", false, i, async () => {
        await shuffleProfile(page, pinnedUsername).click({ force: true });
      });
      all.push({ pathId: "shuffle→profile-cached", cold: false, runIndex: i, pinnedUsername, ...payload });
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        (user) =>
          Boolean(
            document.querySelector(
              `button[data-action="profile"][data-username="${user}"]`,
            ),
          ),
        pinnedUsername,
        { timeout: 15000 },
      );
      const btn = shuffleProfile(page, pinnedUsername);
      await btn.scrollIntoViewIfNeeded();
      await btn.waitFor({ state: "visible", timeout: 15000 });
    } catch (error) {
      const dbg = await page.evaluate(() => ({
        url: location.href,
        pipeline: window.__sayittomeProfilePipeline?.exportLast?.(),
        samples: window.__sayittomeNavTrace?.export?.()?.samples?.slice(-3),
      }));
      all.push({
        pathId: "shuffle→profile-cached",
        cold: false,
        runIndex: i,
        aborted: String(error),
        dbg,
      });
      await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
    }
  }
  await context.close();
}

// Cold: fresh context, clear memory cache
{
  const context = await browser.newContext({ ...devices["Pixel 5"], locale: "es-AR" });
  const page = await context.newPage();
  await prep(page);
  const username = await shuffleProfile(page).getAttribute("data-username");
  await clearProfileCache(page, username);

  try {
    const payload = await measure(page, "shuffle→profile-cold", true, 0, async () => {
      await clearProfileCache(page, username);
      await shuffleProfile(page, username).click({ force: true });
    });
    all.push({ pathId: "shuffle→profile-cold", cold: true, runIndex: 0, ...payload });
  } catch (error) {
    const dbg = await page.evaluate(() => ({
      url: location.href,
      pipeline: window.__sayittomeProfilePipeline?.exportLast?.() ||
        window.__sayittomeProfilePipeline?.snapshot?.(),
      samples: window.__sayittomeNavTrace?.export?.()?.samples?.slice(-3),
    }));
    all.push({
      pathId: "shuffle→profile-cold",
      cold: true,
      runIndex: 0,
      aborted: String(error),
      dbg,
    });
  }
  await context.close();
}

await browser.close();

const warmSamples = all.filter((r) => r.pathId === "shuffle→profile-cached" && r.sample && !r.aborted);
const warmPd = warmSamples.map((r) => pdMs(r.sample)).filter((v) => typeof v === "number");
const median = percentile(warmPd, 50);
const p95 = percentile(warmPd, 95);

const medianSample = pickClosest(warmSamples.map((r) => r.sample), median);
const p95Sample = pickClosest(warmSamples.map((r) => r.sample), p95);
const coldRow = all.find((r) => r.pathId === "shuffle→profile-cold");

const report = {
  baseUrl,
  measuredAt: new Date().toISOString(),
  warmStats: {
    count: warmPd.length,
    median: Math.round(median),
    p95: Math.round(p95),
    min: warmPd.length ? Math.min(...warmPd) : null,
    max: warmPd.length ? Math.max(...warmPd) : null,
  },
  medianWaterfall: medianSample ? waterfallLines(medianSample) : null,
  p95Waterfall: p95Sample ? waterfallLines(p95Sample) : null,
  cold: coldRow?.aborted
    ? { aborted: coldRow.aborted, dbg: coldRow.dbg }
    : {
        waterfall: coldRow?.sample ? waterfallLines(coldRow.sample) : null,
        pipeline: coldRow?.pipeline || null,
      },
  runs: all,
};

fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log("\n=== WARM median waterfall (~" + Math.round(median) + " ms) ===");
for (const line of report.medianWaterfall || []) console.log(line);

console.log("\n=== WARM p95 waterfall (~" + Math.round(p95) + " ms) ===");
for (const line of report.p95Waterfall || []) console.log(line);

console.log("\n=== COLD ===");
if (coldRow?.aborted) {
  console.log("ABORTED:", coldRow.aborted);
  console.log(JSON.stringify(coldRow.dbg, null, 2));
} else {
  for (const line of report.cold.waterfall || []) console.log(line);
  if (report.cold.pipeline) {
    console.log("\nPipeline snapshot:", JSON.stringify(report.cold.pipeline, null, 2));
  }
}

console.log(`\nWrote ${outFile}`);
