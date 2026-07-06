/**
 * Full navigation baseline with scenario validation.
 *
 * Build: cross-env NEXT_PUBLIC_NAV_TRACE=1 npm run build
 * Start: npm start -- -p 3002
 * Run:   node scripts/nav-bench-baseline.mjs --base http://localhost:3002 --warm 5
 * CPU:   node scripts/nav-bench-baseline.mjs --cpu 4 --cpu-only
 */

import { chromium, devices } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function loadBenchEnvFile() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      if (!key.startsWith("BENCH_") && !key.startsWith("NAV_BENCH_")) continue;
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional local bench credentials
  }
}

loadBenchEnvFile();

const args = process.argv.slice(2);

function argValue(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

function sectionEnabled(...pathIds) {
  if (!onlyFilter) return true;
  return pathIds.some((id) => id.includes(onlyFilter) || onlyFilter.includes(id));
}

const baseUrl = argValue("--base", "http://localhost:3002");
const warmRuns = Number(argValue("--warm", "5"));
const cpuThrottle = args.includes("--cpu") ? Number(argValue("--cpu", "4")) : null;
const cpuOnly = args.includes("--cpu-only");
const skipBackLock = args.includes("--skip-back-lock");
const outFile = argValue("--out", "scripts/nav-bench-results-baseline.json");
const onlyFilter = argValue("--only", "");
const deferInboxFlag = argValue("--defer-inbox", "");
const chatsDeferCompare = args.includes("--chats-defer-compare");
const storageStateFile = argValue("--storage-state", "scripts/bench-storage-state.json");
const BENCH_USERNAME = "navbench";

const METHODOLOGY_NOTE =
  "La medición inicial de 530 ms para perfil cacheado era inválida. El runner eliminaba la caché en memoria y podía elegir un username distinto. Con escenario estable y cache hit verificado, la mediana real es aproximadamente 19–21 ms. Los valores 527 ms (chats) y 452 ms (settings) permanecen sospechosos hasta reproducir con esta metodología.";

const SCENARIO_RULES = {
  "shuffle→profile-cached": {
    expectedScenario: "profile-warm-cache-hit",
    requiredPhases: ["profile-cache-hit"],
    forbiddenPhases: ["profile-cache-miss"],
  },
  "shuffle→profile-cold": {
    expectedScenario: "profile-cold",
    requiredPhases: ["profile-cache-miss"],
    forbiddenPhases: ["profile-cache-hit"],
  },
  "profile→chat-cached": {
    expectedScenario: "chat-metadata-cache-hit",
    requiredPhases: [],
    forbiddenPhases: [],
  },
  "profile→chat-cold": {
    expectedScenario: "chat-metadata-cold",
    forbiddenPhases: [],
  },
  "chat→profile": { expectedScenario: "chat-to-profile" },
  "profile→shuffle": { expectedScenario: "profile-to-shuffle" },
  "tab→stories-cold": { expectedScenario: "stories-cold-first-mount" },
  "tab→stories-warm": {
    expectedScenario: "stories-warm-keep-alive",
    requiredPhases: ["tab-pin", "tab-panel-visible"],
  },
  "tab→chats-A": {
    expectedScenario: "chats-keep-alive-revisit",
    requiredPhases: ["tab-pin", "chats-chats-panel-visible"],
  },
  "tab→chats-B": {
    expectedScenario: "chats-first-visit-snapshot",
    requiredPhases: [
      "chats-snapshot-read-start",
      "chats-snapshot-accepted",
      "chats-snapshot-parsed",
    ],
    forbiddenPhases: ["chats-inbox-memory-hit", "chats-snapshot-rejected"],
  },
  "tab→chats-C": {
    expectedScenario: "chats-first-visit-cold",
    forbiddenPhases: ["chats-snapshot-accepted", "chats-inbox-memory-hit"],
  },
  "tab→boost-cold": { expectedScenario: "boost-cold-first-mount" },
  "tab→boost-warm": {
    expectedScenario: "boost-warm-keep-alive",
    requiredPhases: ["tab-pin"],
  },
  "tab-chain→chats-warm": {
    expectedScenario: "chats-warm-keep-alive-chain",
    requiredPhases: ["tab-pin", "tab-panel-visible"],
  },
  "tab-chain→boost-warm": {
    expectedScenario: "boost-warm-keep-alive-chain",
    requiredPhases: ["tab-pin", "tab-panel-visible"],
  },
  "tab-chain→settings-warm": {
    expectedScenario: "settings-warm-keep-alive-chain",
    requiredPhases: ["tab-pin", "tab-panel-visible"],
  },
  "tab-chain→stories-warm": {
    expectedScenario: "stories-warm-keep-alive-chain",
    requiredPhases: ["tab-pin", "tab-panel-visible"],
  },
  "tab→settings-A": {
    expectedScenario: "settings-keep-alive-revisit",
    requiredPhases: ["tab-pin", "settings-settings-panel-visible"],
  },
  "tab→settings-B": {
    expectedScenario: "settings-first-visit-memory",
    requiredPhases: ["settings-memory-profile-hit"],
  },
  "tab→settings-C": {
    expectedScenario: "settings-first-visit-session",
    requiredPhases: ["settings-session-hit"],
    forbiddenPhases: ["settings-memory-profile-hit"],
  },
  "tab→settings-D": {
    expectedScenario: "settings-cold-no-cache",
    forbiddenPhases: ["settings-session-hit", "settings-memory-profile-hit"],
  },
  "tab→settings-E": {
    expectedScenario: "settings-anonymous",
    requiredPhases: ["settings-anon-gate-true"],
  },
  "tray→viewer-preloaded": {
    expectedScenario: "story-tray-viewer-preloaded",
    requiredPhases: ["story-media-ready-before-input"],
    forbiddenPhases: [],
  },
  "tray→viewer-not-preloaded": {
    expectedScenario: "story-tray-viewer-not-preloaded",
    forbiddenPhases: ["story-media-ready-before-input"],
  },
  "mosaic→viewer-preloaded": {
    expectedScenario: "story-mosaic-viewer-preloaded",
    requiredPhases: ["story-media-ready-before-input"],
  },
  "story→next-preloaded": {
    expectedScenario: "story-next-preloaded",
    requiredPhases: ["story-media-ready-before-input"],
  },
  "story→next-not-decoded": {
    expectedScenario: "story-next-not-decoded",
    forbiddenPhases: ["story-media-ready-before-input"],
  },
  "last-story→next-user-preloaded": {
    expectedScenario: "last-story-next-user-preloaded",
    requiredPhases: ["story-media-ready-before-input"],
  },
  "last-story→next-user-pending": {
    expectedScenario: "last-story-next-user-pending",
    forbiddenPhases: ["story-media-ready-before-input"],
  },
  "hardware-back": { expectedScenario: "hardware-back" },
};

const CPU4X_SCENARIOS = [
  "shuffle→profile-cached",
  "shuffle→profile-cold",
  "tab→chats-B",
  "tab→chats-C",
  "tab→settings-A",
  "tab→settings-D",
  "profile→chat-cached",
  "story→next-preloaded",
  "last-story→next-user-preloaded",
];

const STORY_ADVANCE_SCENARIOS = new Set([
  "story→next-preloaded",
  "story→next-not-decoded",
  "last-story→next-user-preloaded",
  "last-story→next-user-pending",
]);

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx]);
}

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

function hasPhase(sample, phase) {
  const d = sample.detailPhases || {};
  const p = sample.phases || {};
  return Object.prototype.hasOwnProperty.call(d, phase) || Object.prototype.hasOwnProperty.call(p, phase);
}

function hasPipelinePhase(pipeline, phase) {
  const chats = pipeline?.chats?.phases || {};
  const settings = pipeline?.settings?.phases || {};
  const story = pipeline?.story?.phases || {};
  if (phase === "chats-chats-panel-visible" && chats["chats-panel-visible"] != null) {
    return true;
  }
  if (phase === "settings-settings-panel-visible" && settings["settings-panel-visible"] != null) {
    return true;
  }
  if (phase === "tab-pin" && (chats["chats-panel-visible"] != null || settings["settings-panel-visible"] != null)) {
    return true;
  }
  if (phase === "chats-snapshot-read-start" && chats["snapshot-read-start"] != null) {
    return true;
  }
  if (phase === "chats-snapshot-parsed" && chats["snapshot-parsed"] != null) {
    return true;
  }
  if (phase === "chats-snapshot-accepted" && chats["snapshot-accepted"] != null) {
    return true;
  }
  if (phase === "chats-snapshot-rejected" && chats["snapshot-rejected"] != null) {
    return true;
  }
  if (phase === "chats-inbox-memory-hit" && chats["inbox-memory-hit"] != null) {
    return true;
  }
  if (phase === "settings-memory-profile-hit" && settings["memory-profile-hit"] != null) {
    return true;
  }
  if (phase === "settings-session-hit" && settings["session-hit"] != null) {
    return true;
  }
  if (phase === "settings-anon-gate-true" && settings["anon-gate-true"] != null) {
    return true;
  }
  if (phase === "story-media-ready-before-input" && story["media-ready-before-input"] != null) {
    return true;
  }
  return false;
}

function validateSample(sample, rules = {}, pipeline = {}, navMeta = null) {
  const reasons = [];
  if (sample.aborted) reasons.push(`aborted:${sample.aborted}`);
  if (
    typeof sample.phases?.["useful-paint"] !== "number" &&
    typeof sample.paintTimings?.["stale-useful-paint"] !== "number" &&
    typeof sample.paintTimings?.["shell-paint"] !== "number"
  ) {
    reasons.push("missing:useful-paint");
  }
  if (navMeta?.usedGotoFallback && !sample.cold) {
    reasons.push("forbidden:goto-fallback-on-warm");
  }
  if (navMeta && navMeta.ok === false) {
    reasons.push(`spa-nav-failed:${navMeta.reason || "unknown"}`);
  }
  if (rules.expectedScenario && sample.expectedScenario !== rules.expectedScenario) {
    reasons.push(`expectedScenario:${sample.expectedScenario || "none"}!=${rules.expectedScenario}`);
  }
  for (const phase of rules.requiredPhases || []) {
    if (!hasPhase(sample, phase) && !hasPipelinePhase(pipeline, phase)) {
      reasons.push(`missing:${phase}`);
    }
  }
  for (const phase of rules.forbiddenPhases || []) {
    if (hasPhase(sample, phase) || hasPipelinePhase(pipeline, phase)) {
      reasons.push(`forbidden:${phase}`);
    }
  }
  return { valid: reasons.length === 0, reasons };
}

function paintMetric(rows, key) {
  const vals = rows
    .map((s) => s.paintTimings?.[key] ?? s.sample?.paintTimings?.[key])
    .filter((v) => typeof v === "number");
  return {
    count: vals.length,
    median: vals.length ? percentile(vals, 50) : null,
    p95: vals.length ? percentile(vals, 95) : null,
  };
}

function chatsPipelineMetric(rows, phase) {
  const vals = rows
    .map((s) => s.chats?.phases?.[phase] ?? s.pipeline?.chats?.phases?.[phase])
    .filter((v) => typeof v === "number");
  return {
    count: vals.length,
    median: vals.length ? percentile(vals, 50) : null,
    p95: vals.length ? percentile(vals, 95) : null,
  };
}

function summarizeValid(samples, pathId) {
  const rows = samples.filter((s) => s.pathId === pathId && s.validation?.valid);
  const pd = rows.map((s) => pdMs(s)).filter((v) => typeof v === "number");
  const busy = rows.map((s) => s.mainThreadBusyMs).filter((v) => typeof v === "number");
  const longTasks = rows.flatMap((s) => (s.longTasks || []).filter((t) => t.durationMs >= 50));
  const summary = {
    pathId,
    validCount: rows.length,
    invalidCount: samples.filter((s) => s.pathId === pathId && !s.validation?.valid).length,
    min: pd.length ? Math.min(...pd) : null,
    median: percentile(pd, 50),
    p95: percentile(pd, 95),
    max: pd.length ? Math.max(...pd) : null,
    mainThreadBusyMedian: percentile(busy, 50),
    longTasksOver50ms: longTasks.length,
    longTaskMsTotal: Math.round(longTasks.reduce((s, t) => s + t.durationMs, 0)),
  };

  if (pathId.startsWith("tab→chats")) {
    summary.chatsPaint = {
      inputToStaleUseful: paintMetric(rows, "stale-useful-paint"),
      inputToFreshNetwork: paintMetric(rows, "fresh-network-paint"),
      inputToShell: paintMetric(rows, "shell-paint"),
      pipelineStaleUseful: chatsPipelineMetric(rows, "stale-useful-paint"),
      pipelineFreshNetwork: chatsPipelineMetric(rows, "fresh-network-paint"),
      snapshotAccepted: chatsPipelineMetric(rows, "snapshot-accepted"),
      firestoreFirstCallback: chatsPipelineMetric(rows, "firestore-first-callback"),
    };
  }

  if (pathId === "shuffle→profile-cached") {
    const cacheHit = rows
      .map((s) => s.profile?.phases?.["cache-hit"] ?? s.pipeline?.profile?.phases?.["cache-hit"])
      .filter((v) => typeof v === "number");
    const stateReady = rows
      .map((s) => s.profile?.phases?.["state-ready"] ?? s.pipeline?.profile?.phases?.["state-ready"])
      .filter((v) => typeof v === "number");
    summary.profilePipeline = {
      cacheHitMedian: cacheHit.length ? percentile(cacheHit, 50) : null,
      stateReadyMedian: stateReady.length ? percentile(stateReady, 50) : null,
      note:
        "Si median >> waterfall (~19–21 ms), revisar selector/scroll del perfil pinned en el feed, no asumir regresión de producción.",
    };
  }

  return summary;
}

async function dismissOverlays(page) {
  const language = page.locator('[aria-labelledby="language-prompt-title"]');
  if (await language.isVisible({ timeout: 500 }).catch(() => false)) {
    await page
      .locator('[aria-labelledby="language-prompt-title"] button')
      .first()
      .click({ force: true });
  }
  const legal = page.locator(".sayittome-entry-legal-modal");
  if (await legal.isVisible({ timeout: 500 }).catch(() => false)) {
    const decl = legal.locator("button").filter({ hasText: /Entiendo|Understand|Capisco/i });
    if (await decl.count()) await decl.first().click({ force: true });
    await legal
      .getByRole("button", { name: /Acepto|Accept|Accetto/i })
      .click({ force: true });
  }
  const notify = page.locator('[aria-labelledby="chat-notification-prompt-title"]');
  if (await notify.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.getByRole("button", { name: /Ahora no|Not now/i }).click({ force: true });
  }
}

async function ensureBenchAuth(page) {
  if (fs.existsSync(storageStateFile)) {
    await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissOverlays(page);
    const loggedIn = await page.waitForFunction(
      () => {
        const keys = Object.keys(localStorage);
        return keys.some((k) => k.includes("firebase:authUser"));
      },
      { timeout: 20000 },
    ).then(() => true).catch(() => false);
    if (loggedIn) return true;
  }

  const email = process.env.BENCH_EMAIL || process.env.NAV_BENCH_EMAIL;
  const password = process.env.BENCH_PASSWORD || process.env.NAV_BENCH_PASSWORD;
  if (!email || !password) {
    console.warn("bench-auth: no session and BENCH_EMAIL/BENCH_PASSWORD unset — inbox scenarios may INVALID");
    return false;
  }

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('form button[type="submit"], form button:not([type="button"])').first().click();
  await page.waitForURL(/\/(shuffle|chats|settings|boost|stories)/, { timeout: 45000 });
  await dismissOverlays(page);
  return true;
}

async function ensureTraceEnabled(page) {
  await page.evaluate(() => {
    localStorage.setItem("sayittome:nav-trace", "1");
  });
  const hasTrace = await page.evaluate(() => Boolean(window.__sayittomeNavTrace));
  if (hasTrace) return;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => Boolean(window.__sayittomeNavTrace), { timeout: 30000 });
}

async function prepareBenchSession(page) {
  await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((deferFlag) => {
    localStorage.setItem("sayittome:nav-trace", "1");
    localStorage.setItem("sayittome_locale_prompt_done", "1");
    localStorage.setItem(
      "sayittome-chat-notification-prefs",
      JSON.stringify({ enabled: false, prompted: true }),
    );
    sessionStorage.setItem("sayittome_anon_legal_accepted_v1", "1");
    sessionStorage.setItem("sayittome:shuffle:legal-unlocked:v1", "1");
    if (deferFlag === "1") {
      localStorage.setItem("sayittome:bench:defer-inbox-firestore", "1");
    } else if (deferFlag === "0") {
      localStorage.removeItem("sayittome:bench:defer-inbox-firestore");
    }
  }, deferInboxFlag);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await dismissOverlays(page);
  await page.waitForFunction(() => Boolean(window.__sayittomeNavTrace), { timeout: 30000 });
  const hasTrace = await page.evaluate(() => Boolean(window.__sayittomeNavTrace));
  if (!hasTrace) {
    throw new Error("Nav trace API missing. Build with NEXT_PUBLIC_NAV_TRACE=1.");
  }
  await ensureBenchAuth(page);
}

function shuffleProfile(page, username) {
  const selector = username
    ? `button[data-action="profile"][data-username="${username}"]`
    : 'button[data-action="profile"][data-username]';
  return page.locator(
    `[data-scroll-root].sayittome-shuffle-scroll-classic ${selector}, .sayittome-shuffle-keepalive-visible ${selector}`,
  );
}

async function bottomTab(page, href) {
  const nav = page.locator(".sayittome-bottom-nav");
  if (!(await nav.isVisible().catch(() => false))) {
    return null;
  }

  const tabId = href.replace(/^\//, "");
  const byData = page.locator(`[data-nav-tab="${tabId}"]`).first();
  if ((await byData.count()) > 0) return byData;

  if (href === "/shuffle") {
    return page.locator(".sayittome-bottom-nav-inner > *").nth(2);
  }
  return page.locator(`.sayittome-bottom-nav a[href='${href}']`).first();
}

async function clickTabSpa(page, href) {
  const tab = await bottomTab(page, href);
  if (!tab || (await tab.count()) === 0) {
    return { ok: false, method: "none", usedGotoFallback: false, reason: "tab-not-found", href };
  }

  try {
    await tab.waitFor({ state: "visible", timeout: 8000 });
    await tab.scrollIntoViewIfNeeded().catch(() => undefined);
    await tab.click({ force: true, timeout: 8000 });
    await page.waitForURL(new RegExp(href.replace("/", "\\/")), { timeout: 12000 });
    if (!page.url().includes(href)) {
      return {
        ok: false,
        method: "spa-click",
        usedGotoFallback: false,
        reason: `url-mismatch:${page.url()}`,
        href,
      };
    }
    return { ok: true, method: "spa-click", usedGotoFallback: false, href };
  } catch (error) {
    return {
      ok: false,
      method: "spa-click",
      usedGotoFallback: false,
      reason: String(error),
      href,
    };
  }
}

async function ensureTab(page, href) {
  const spa = await clickTabSpa(page, href);
  if (spa.ok) return spa;
  await page.goto(`${baseUrl}${href}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await dismissOverlays(page);
  return {
    ok: true,
    method: "goto-fallback",
    usedGotoFallback: true,
    reason: spa.reason,
    href,
  };
}

async function spaTab(page, href) {
  const result = await clickTabSpa(page, href);
  await page.evaluate((nav) => {
    window.__sayittomeBenchNav = nav;
  }, result);
  if (!result.ok) {
    throw new Error(`spa-nav-failed:${result.reason}`);
  }
  return result;
}

/** @deprecated setup-only — warm measurements must use spaTab(). */
async function clickTab(page, href) {
  return ensureTab(page, href);
}

async function waitForUsefulPaint(page, pathId, timeoutMs = 45000) {
  await page.waitForFunction(
    (pid) => {
      const { samples } = window.__sayittomeNavTrace.export();
      const sample = samples.filter((s) => s.pathId === pid).at(-1);
      if (!sample) return false;
      return (
        typeof sample.phases?.["useful-paint"] === "number" ||
        typeof sample.paintTimings?.["stale-useful-paint"] === "number" ||
        typeof sample.paintTimings?.["shell-paint"] === "number"
      );
    },
    pathId,
    { timeout: timeoutMs },
  );
}

async function waitForSampleComplete(page, pathId, cold) {
  const timeoutMs = cold ? 20000 : 45000;
  if (STORY_ADVANCE_SCENARIOS.has(pathId)) {
    await page.waitForFunction(
      () => {
        const story = window.__sayittomeStoryPipeline?.snapshot?.();
        const { samples } = window.__sayittomeNavTrace.export();
        const sample = samples.at(-1);
        return (
          story?.phases?.["viewer-dom"] != null ||
          story?.phases?.["media-ready-before-input"] != null ||
          story?.phases?.["useful-paint"] != null ||
          typeof sample?.phases?.["useful-paint"] === "number"
        );
      },
      { timeout: timeoutMs },
    );
    await page.evaluate(() => {
      if (window.__sayittomeNavTrace?.mark) {
        window.__sayittomeNavTrace.mark("useful-paint");
        window.__sayittomeNavTrace.finish(undefined, "useful-paint");
      }
    });
    return;
  }
  await waitForUsefulPaint(page, pathId, timeoutMs);
}

async function measureSample(page, { pathId, cold, runIndex, expectedScenario, action }) {
  const skipStoryReset = STORY_ADVANCE_SCENARIOS.has(pathId);
  const skipPreloadLock = pathId === "tray→viewer-not-preloaded" || pathId === "story→next-not-decoded" || pathId === "last-story→next-user-pending";

  await page.evaluate(
    ({ pathId, cold, runIndex, expectedScenario, skipStoryReset, skipPreloadLock }) => {
      window.__sayittomeBenchNav = null;
      if (!skipStoryReset) {
        window.__sayittomeStoryPipeline?.resetMedia?.();
      }
      if (skipPreloadLock) {
        window.__sayittomeStoriesBench?.clearPreload?.();
        window.__sayittomeStoryPipeline?.resetMedia?.();
      }
      window.__sayittomeNavTrace.begin(pathId, cold, runIndex, expectedScenario);
    },
    { pathId, cold, runIndex, expectedScenario, skipStoryReset, skipPreloadLock },
  );
  await page.evaluate((skipPreloadLock) => {
    if (!skipPreloadLock) {
      window.__sayittomeStoryPipeline?.lockInput?.();
    }
    window.__sayittomeNavTrace.mark("pointerdown");
  }, skipPreloadLock);
  await action();
  await page.evaluate(() => window.__sayittomeNavTrace.mark("click"));
  await waitForSampleComplete(page, pathId, cold);

  const payload = await page.evaluate((pid) => {
    const { samples } = window.__sayittomeNavTrace.export();
    const sample = samples.filter((s) => s.pathId === pid).at(-1);
    const chats = window.__sayittomeChatsPipeline?.snapshot?.() || null;
    const settings = window.__sayittomeSettingsPipeline?.snapshot?.() || null;
    const profile = window.__sayittomeProfilePipeline?.snapshot?.() || null;
    const story = window.__sayittomeStoryPipeline?.snapshot?.() || null;
    const navMeta = window.__sayittomeBenchNav || null;
    return { sample, chats, settings, profile, story, navMeta, url: location.href };
  }, pathId);

  const rules = SCENARIO_RULES[pathId] || {};
  const validation = validateSample(
    payload.sample || { pathId, aborted: "no-sample" },
    rules,
    { chats: payload.chats, settings: payload.settings, profile: payload.profile, story: payload.story },
    payload.navMeta,
  );

  return {
    pathId,
    cold,
    runIndex,
    expectedScenario,
    ...payload,
    validation,
  };
}

async function runWarmLoop(page, pathId, setup, interact, runs = warmRuns) {
  const results = [];
  for (let i = 0; i < runs; i += 1) {
    if (onlyFilter && !pathId.includes(onlyFilter) && pathId !== onlyFilter) continue;
    if (cpuOnly && !CPU4X_SCENARIOS.includes(pathId)) continue;
    await setup(i);
    try {
      results.push(
        await measureSample(page, {
          pathId,
          cold: false,
          runIndex: i,
          expectedScenario: SCENARIO_RULES[pathId]?.expectedScenario,
          action: () => interact(i),
        }),
      );
    } catch (error) {
      results.push({
        pathId,
        cold: false,
        runIndex: i,
        validation: { valid: false, reasons: [`error:${String(error)}`] },
      });
    }
  }
  return results;
}

async function runColdLoop(page, pathId, setup, interact, runs = 2) {
  const results = [];
  for (let i = 0; i < runs; i += 1) {
    if (onlyFilter && !pathId.includes(onlyFilter) && pathId !== onlyFilter) continue;
    if (cpuOnly && !CPU4X_SCENARIOS.includes(pathId)) continue;
    await setup(i);
    await ensureTraceEnabled(page);
    try {
      results.push(
        await measureSample(page, {
          pathId,
          cold: true,
          runIndex: i,
          expectedScenario: SCENARIO_RULES[pathId]?.expectedScenario,
          action: () => interact(i),
        }),
      );
    } catch (error) {
      results.push({
        pathId,
        cold: true,
        runIndex: i,
        validation: { valid: false, reasons: [`error:${String(error)}`] },
      });
    }
  }
  return results;
}

async function ensureShuffleReady(page) {
  if (!page.url().includes("/shuffle")) {
    await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await dismissOverlays(page);
  }
  await shuffleProfile(page)
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => undefined);
}

async function pinShuffleProfileUsername(page) {
  await ensureShuffleReady(page);
  const firstBtn = shuffleProfile(page).first();
  await firstBtn.scrollIntoViewIfNeeded();
  const attrUsername = (await firstBtn.getAttribute("data-username")) || "";
  await firstBtn.click({ force: true, timeout: 30000 });
  await page.waitForURL(/\/u\//, { timeout: 30000 });
  const urlUsername = decodeURIComponent(page.url().split("/u/")[1]?.split("/")[0] || "");
  const pinnedUsername = urlUsername || attrUsername;
  await page.waitForFunction(
    () => {
      const snap = window.__sayittomeProfilePipeline?.snapshot?.();
      return Boolean(snap?.phases?.["set-profile"] || snap?.phases?.["cache-hit"]);
    },
    { timeout: 20000 },
  );
  await page.goBack({ waitUntil: "domcontentloaded" });
  await ensureShuffleReady(page);
  return pinnedUsername;
}

async function scrollPinnedProfileIntoView(page, username) {
  await page.evaluate((user) => {
    const escaped = CSS.escape(user);
    const selector = `button[data-action="profile"][data-username="${escaped}"]`;
    for (const btn of document.querySelectorAll(selector)) {
      btn.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }, username);
  await page.waitForTimeout(120);
}

async function clickShuffleProfile(page, username) {
  await ensureShuffleReady(page);
  const target = shuffleProfile(page, username).first();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await target.count()) > 0) {
      await scrollPinnedProfileIntoView(page, username);
      if (await target.isVisible().catch(() => false)) {
        await target.click({ force: true, timeout: 15000 });
        return;
      }
    }
    await page.mouse.wheel(0, attempt % 2 === 0 ? 650 : -550);
    await page.waitForTimeout(250);
  }

  const clicked = await page.evaluate((user) => {
    const escaped = CSS.escape(user);
    const btn = document.querySelector(
      `button[data-action="profile"][data-username="${escaped}"]`,
    );
    if (!btn) return false;
    btn.scrollIntoView({ block: "center", inline: "nearest" });
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  }, username);
  if (clicked) return;

  throw new Error(`profile ${username} not visible on shuffle feed`);
}

async function openPinnedProfile(page, username, { preferDirect = true } = {}) {
  if (username && preferDirect) {
    await page.goto(`${baseUrl}/u/${encodeURIComponent(username)}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForURL(/\/u\//, { timeout: 30000 });
    return;
  }
  await clickShuffleProfile(page, username);
  await page.waitForURL(/\/u\//, { timeout: 30000 });
}
async function seedProfileCache(page, username) {
  if (!username) {
    return pinShuffleProfileUsername(page);
  }
  await openPinnedProfile(page, username);
  await page.waitForFunction(
    () => {
      const snap = window.__sayittomeProfilePipeline?.snapshot?.();
      return Boolean(snap?.phases?.["set-profile"] || snap?.phases?.["cache-hit"]);
    },
    { timeout: 20000 },
  );
  await page.goBack({ waitUntil: "domcontentloaded" });
  await ensureShuffleReady(page);
  return username;
}

async function profileChatButton(page) {
  await page.waitForURL(/\/u\//, { timeout: 10000 }).catch(() => undefined);
  const chatBtn = page.locator("[data-nav-profile-chat]").first();
  if (await chatBtn.count()) {
    await chatBtn.scrollIntoViewIfNeeded().catch(() => undefined);
    return chatBtn;
  }

  await page.waitForSelector("[data-nav-primary-content], [data-nav-profile-main]", {
    state: "attached",
    timeout: 8000,
  });
  await page
    .waitForFunction(
      () => {
        const snap = window.__sayittomeProfilePipeline?.snapshot?.();
        return Boolean(
          snap?.phases?.["state-ready"] ||
            snap?.phases?.["set-profile"] ||
            snap?.phases?.["cache-hit"],
        );
      },
      { timeout: 30000 },
    )
    .catch(() => undefined);

  await page.evaluate(() => {
    const selectors = [
      "[data-nav-primary-content] button:has(.bg-green-500)",
      "[data-nav-profile-main] button:has(.bg-green-500)",
      "button:has(.bg-green-500)",
      "[data-nav-primary-content] .grid-cols-4 button",
      "[data-nav-profile-main] .grid-cols-4 button",
    ];
    for (const selector of selectors) {
      const buttons = document.querySelectorAll(selector);
      const target = buttons[1] || buttons[0];
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: "center", inline: "nearest" });
        break;
      }
    }
  });
  await page.waitForTimeout(150);

  const selectors = [
    "[data-nav-primary-content] button:has(.bg-green-500)",
    "[data-nav-profile-main] button:has(.bg-green-500)",
    "button:has(.bg-green-500)",
    "[data-nav-primary-content] .grid-cols-4 button >> nth=1",
    "[data-nav-profile-main] .grid-cols-4 button >> nth=1",
    ".grid-cols-4 button >> nth=1",
  ];

  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      await loc.scrollIntoViewIfNeeded().catch(() => undefined);
      return loc;
    }
  }

  throw new Error("profile chat button not found");
}

async function openProfileChat(page, { fast = false } = {}) {
  const username = decodeURIComponent(page.url().split("/u/")[1]?.split("/")[0] || "");
  if (!fast) {
    try {
      const chatBtn = await profileChatButton(page);
      await chatBtn.click({ force: true, timeout: 5000 });
      await page.waitForURL(/\/chat\//, { timeout: 10000 });
      return;
    } catch {
      // Fall through to redirect route used by the product.
    }
  }
  if (!username) throw new Error("profile chat open failed: missing username");
  await page.goto(`${baseUrl}/u/${encodeURIComponent(username)}/chat`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForURL(/\/chat\//, { timeout: 30000 });
}

async function clearProfileCache(page, username) {
  await page.evaluate((user) => {
    window.__sayittomeProfileCache?.clear?.(user);
    window.__sayittomeProfileCache?.clear?.();
  }, username);
}

async function runBackLockProbe(page, pinnedUsername) {
  const gaps = [50, 80, 100, 120, 150, 250];
  const probeResults = [];

  for (const gapMs of gaps) {
    await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
    await dismissOverlays(page);
    await ensureTab(page, "/stories");
    await openPinnedProfile(page, pinnedUsername || BENCH_USERNAME);
    if (!page.url().includes("/u/")) {
      await page.goto(`${baseUrl}/u/${encodeURIComponent(pinnedUsername || BENCH_USERNAME)}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    }
    await page.waitForURL(/\/u\//, { timeout: 30000 });
    await page.evaluate(() => {
      sessionStorage.setItem("sayittome-profile-return", "/stories");
    });
    await page.evaluate(() => window.__sayittomeBackLockProbe?.clear?.());

    const row = await page.evaluate(async (gap) => {
      window.__sayittomeBackLockProbe?.clear?.();
      window.__sayittomeBackLockProbe?.setLockMs?.(null);

      const pathnameBefore = location.pathname;
      window.dispatchEvent(new Event("sayittomeHardwareBack"));
      await new Promise((r) => setTimeout(r, 120));
      const pathnameAfterFirst = location.pathname;

      await new Promise((r) => setTimeout(r, gap));
      const tSecond = Date.now();
      window.dispatchEvent(new Event("sayittomeHardwareBack"));
      await new Promise((r) => setTimeout(r, 120));

      const pathnameAfterSecond = location.pathname;
      const log = window.__sayittomeBackLockProbe?.export?.() || [];
      const discarded = log.filter((e) => e.outcome === "discarded-lock");
      const navigated = log.filter((e) => e.outcome === "navigate");

      return {
        gapMs: gap,
        pathnameBefore,
        pathnameAfterFirst,
        pathnameAfterSecond,
        firstBackNavigated: pathnameBefore !== pathnameAfterFirst,
        secondBackNavigated: pathnameAfterFirst !== pathnameAfterSecond,
        eventsReceived: log.length,
        eventsDiscarded: discarded.length,
        eventsNavigated: navigated.length,
        probeLog: log,
        secondDiscardedWithinGap: discarded.some((e) => e.at >= tSecond - 30),
      };
    }, gapMs);

    probeResults.push(row);
  }

  return probeResults;
}

async function seedChatsInboxSnapshot(page) {
  await ensureTab(page, "/chats");
  await page.waitForSelector(".sayittome-bottom-nav", { timeout: 15000 });

  await page.waitForFunction(
    () => {
      const snap = window.__sayittomeChatsPipeline?.snapshot?.();
      return (
        snap?.phases?.["auth-ready"] != null ||
        snap?.phases?.["auth-unknown"] != null ||
        snap?.phases?.["chats-mount"] != null
      );
    },
    { timeout: 30000 },
  );

  const seeded = await page.waitForFunction(
    () => {
      const raw = sessionStorage.getItem("sayittome:inbox-snapshot:v1");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return { ok: true, source: "snapshot", count: parsed.length };
        } catch {
          // ignore
        }
      }
      const snap = window.__sayittomeChatsPipeline?.snapshot?.();
      if (snap?.phases?.["firestore-first-callback"] != null) {
        return { ok: true, source: "firestore", count: snap?.meta?.inboxCount || 0 };
      }
      if (document.querySelector("[data-nav-chats-primary]")) {
        return { ok: true, source: "dom", count: 1 };
      }
      return false;
    },
    { timeout: 90000 },
  );

  const meta = await seeded.jsonValue();
  if (!meta?.ok) {
    throw new Error("chats snapshot seed failed: no inbox data after 90s");
  }
  await page.waitForTimeout(800);
  return meta;
}

async function discoverStoryEntities(page) {
  await ensureTab(page, "/stories");
  await page.evaluate(() => window.__sayittomeStoriesBench?.refreshIndex?.());
  await page.waitForFunction(
    () => {
      const groups = window.__sayittomeStoriesBench?.getGroups?.() || [];
      return groups.length >= 2 && groups[0]?.stories?.[0]?.mediaUrl;
    },
    { timeout: 45000 },
  ).catch(() => undefined);
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const groups = window.__sayittomeStoriesBench?.getGroups?.() || [];
    if (groups.length < 2) return null;
    const primary = groups[0];
    const secondary = groups[1];
    const first = primary.stories?.[0];
    const second = primary.stories?.[1];
    const nextUserFirst = secondary.stories?.[0];
    if (!first?.id || !first?.mediaUrl) return null;
    return {
      primaryOwnerUid: primary.ownerUid,
      primaryUsername: primary.ownerUsername,
      primaryStoryCount: primary.stories?.length || 0,
      secondaryOwnerUid: secondary.ownerUid,
      secondaryUsername: secondary.ownerUsername,
      firstStoryId: first.id,
      firstMediaUrl: first.mediaUrl,
      firstMediaType: first.mediaType || "image",
      secondStoryId: second?.id || null,
      secondMediaUrl: second?.mediaUrl || null,
      secondMediaType: second?.mediaType || null,
      nextUserFirstStoryId: nextUserFirst?.id || null,
      nextUserFirstMediaUrl: nextUserFirst?.mediaUrl || null,
      nextUserFirstMediaType: nextUserFirst?.mediaType || null,
    };
  });
}

async function waitStoryMediaReady(page, mediaUrl, timeoutMs = 20000) {
  if (!mediaUrl) throw new Error("missing mediaUrl for preload wait");
  await page.waitForFunction(
    (url) => window.__sayittomeStoryPipeline?.isMediaReady?.(url) === true,
    mediaUrl,
    { timeout: timeoutMs },
  );
}

async function preloadStoryMediaBench(page, ownerUid, mediaUrl) {
  await page.evaluate(
    ({ uid, url }) => {
      window.__sayittomeStoriesBench?.clearPreload?.();
      window.__sayittomeStoryPipeline?.resetMedia?.();
      window.__sayittomeStoriesBench?.preloadOwner?.(uid);
      window.__sayittomeStoriesBench?.preloadMediaUrl?.(url);
    },
    { uid: ownerUid, url: mediaUrl },
  );
  await waitStoryMediaReady(page, mediaUrl);
}

async function runSamePathBackProbe(page) {
  await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
  await dismissOverlays(page);
  await ensureShuffleReady(page);

  return page.evaluate(async () => {
    window.__sayittomeBackLockProbe?.clear?.();
    const pathnameBefore = location.pathname;
    const events = [];

    const fire = async (eventNo, gapBeforeMs = 0) => {
      if (gapBeforeMs > 0) await new Promise((r) => setTimeout(r, gapBeforeMs));
      const at = Date.now();
      window.dispatchEvent(new Event("sayittomeHardwareBack"));
      await new Promise((r) => setTimeout(r, 80));
      const log = window.__sayittomeBackLockProbe?.export?.() || [];
      const last = log.at(-1);
      events.push({
        eventNo,
        timestamp: at,
        pathnameBefore,
        backLockPath: last?.backLockPath || pathnameBefore,
        pathnameAfter: location.pathname,
        outcome: last?.outcome || "none",
        reason: last?.reason || null,
      });
    };

    await fire(1, 0);
    await fire(2, 60);
    return { pathnameBefore, events };
  });
}

async function safeSection(all, name, fn) {
  try {
    const rows = await fn();
    if (Array.isArray(rows)) all.push(...rows);
  } catch (error) {
    console.error(`section ${name} failed:`, error);
    all.push({
      pathId: name,
      validation: { valid: false, reasons: [`section-error:${String(error)}`] },
    });
  }
}

async function runAllScenarios(page, initialUsername) {
  const all = [];
  let pinnedUsername = initialUsername || (await pinShuffleProfileUsername(page));

  try {
  if (sectionEnabled("shuffle→profile-cached", "shuffle→profile-cold")) {
  // shuffle → profile cached (SPA back between samples)
  for (let i = 0; i < warmRuns; i += 1) {
    if (cpuOnly && !CPU4X_SCENARIOS.includes("shuffle→profile-cached")) continue;
    await ensureShuffleReady(page);
    await dismissOverlays(page);
    if (i === 0) {
      // Cache already seeded in main() via pinShuffleProfileUsername.
    }
    try {
      all.push(
        await measureSample(page, {
          pathId: "shuffle→profile-cached",
          cold: false,
          runIndex: i,
          expectedScenario: "profile-warm-cache-hit",
          action: async () => {
            try {
              await clickShuffleProfile(page, pinnedUsername);
            } catch (error) {
              throw error;
            }
          },
        }),
      );
      await page.goBack({ waitUntil: "domcontentloaded" });
      await ensureShuffleReady(page);
      await scrollPinnedProfileIntoView(page, pinnedUsername).catch(() => undefined);
    } catch (error) {
      all.push({
        pathId: "shuffle→profile-cached",
        cold: false,
        runIndex: i,
        validation: {
          valid: false,
          reasons: [`error:${String(error)}`],
        },
      });
      await ensureShuffleReady(page);
      continue;
    }
  }

  all.push(
    ...(await runColdLoop(
      page,
      "shuffle→profile-cold",
      async () => {
        await clearProfileCache(page, pinnedUsername);
        await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
        await dismissOverlays(page);
      },
      async () => {
        await clearProfileCache(page, pinnedUsername);
        await ensureShuffleReady(page);
        await clickShuffleProfile(page, pinnedUsername);
      },
      2,
    )),
  );
  }

  // profile → chat cached / cold
  let chatId = "";
  if (sectionEnabled("profile→chat-cached", "profile→chat-cold")) {
  await safeSection(all, "profile→chat", async () => {
    try {
      pinnedUsername = await seedProfileCache(page, pinnedUsername);
    } catch {
      pinnedUsername = await pinShuffleProfileUsername(page);
    }
    if (!page.url().includes("/u/")) {
      try {
        await openPinnedProfile(page, pinnedUsername);
      } catch {
        pinnedUsername = await pinShuffleProfileUsername(page);
        await openPinnedProfile(page, pinnedUsername);
      }
    }
    await page.waitForURL(/\/u\//, { timeout: 30000 });
    await openProfileChat(page);
    chatId = decodeURIComponent(page.url().split("/chat/")[1]?.split("?")[0] || "");
    await page.goBack({ waitUntil: "domcontentloaded" });

    all.push(
      ...(await runWarmLoop(
        page,
        "profile→chat-cached",
        async () => {
          if (!page.url().includes("/u/")) {
            await page.goBack({ waitUntil: "domcontentloaded" });
          }
        },
        async () => {
          await openProfileChat(page, { fast: false });
        },
      )),
    );

    all.push(
      ...(await runColdLoop(
        page,
        "profile→chat-cold",
        async () => {
          if (!page.url().includes("/u/")) await page.goBack({ waitUntil: "domcontentloaded" });
          await page.evaluate((id) => {
            if (id) sessionStorage.removeItem(`sayittome:chat-msgs:v2:${id}`);
          }, chatId);
        },
        async () => {
          await openProfileChat(page, { fast: false });
        },
        2,
      )),
    );
  });
  }

  // chat → profile
  if (sectionEnabled("chat→profile")) {
  await safeSection(all, "chat→profile", async () => {
    if (!page.url().includes("/chat/")) {
      if (!page.url().includes("/u/")) {
        await openPinnedProfile(page, pinnedUsername);
      }
      await openProfileChat(page);
    }
    all.push(
      ...(await runWarmLoop(
        page,
        "chat→profile",
        async () => {
          if (!page.url().includes("/chat/")) {
            await openProfileChat(page);
          }
        },
        async () => {
          await page.getByRole("button", { name: /Chats|Mensajes|chats/i }).first().click({ force: true });
        },
      )),
    );
  });
  }

  if (sectionEnabled("profile→shuffle")) {
  await safeSection(all, "profile→shuffle", async () => {
    if (!page.url().includes("/u/")) await page.goBack({ waitUntil: "domcontentloaded" });
    all.push(
      ...(await runWarmLoop(
        page,
        "profile→shuffle",
        async () => {
          if (!page.url().includes("/u/")) {
            await openPinnedProfile(page, pinnedUsername);
          }
        },
        async () => {
          await page.goBack({ waitUntil: "domcontentloaded" });
        },
      )),
    );
  });
  }

  if (sectionEnabled("tab→chats-A", "tab→chats-B", "tab→chats-C")) {
  await safeSection(all, "tab→chats", async () => {
  await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
  await dismissOverlays(page);
  await ensureShuffleReady(page);
  await seedChatsInboxSnapshot(page);
  await ensureTab(page, "/shuffle");
  await ensureTab(page, "/chats");
  await page.waitForSelector("[data-nav-chats-primary], .sayittome-bottom-nav", { timeout: 30000 });
  await page.waitForTimeout(800);

  // tab → chats A (revisit keep-alive)
  await ensureTab(page, "/stories");
  all.push(
    ...(await runWarmLoop(page, "tab→chats-A", async () => {}, async () => {
      await spaTab(page, "/chats");
    })),
  );

  // tab → chats B (first visit, snapshot in session, memory cleared)
  await ensureTab(page, "/shuffle");
  await page.evaluate(() => {
    window.__sayittomeInboxCache?.clearMemory?.();
    sessionStorage.removeItem("sayittome:inbox:hydrated:v1");
  });
  await ensureTab(page, "/boost");
  await page.evaluate(() => window.__sayittomeInboxCache?.clearMemory?.());
  all.push(
    ...(await runWarmLoop(
      page,
      "tab→chats-B",
      async () => {
        await page.evaluate(() => window.__sayittomeInboxCache?.clearMemory?.());
        await page.goto(`${baseUrl}/stories`, { waitUntil: "domcontentloaded" });
        await dismissOverlays(page);
        await ensureTraceEnabled(page);
      },
      async () => {
        await page.evaluate(() => window.__sayittomeInboxCache?.clearMemory?.());
        await spaTab(page, "/chats");
      },
      3,
    )),
  );

  // tab → chats C (cold - no snapshot)
  all.push(
    ...(await runColdLoop(
      page,
      "tab→chats-C",
      async () => {
        await page.evaluate(() => window.__sayittomeInboxCache?.clear?.());
        await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
        await dismissOverlays(page);
        await ensureTraceEnabled(page);
      },
      async () => {
        await spaTab(page, "/chats");
      },
      2,
    )),
  );
  });
  }

  if (sectionEnabled("tab→stories-cold", "tab→stories-warm", "tab→boost-cold", "tab→boost-warm")) {
  await safeSection(all, "tab→stories-boost", async () => {
  // stories cold / warm
  await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
  all.push(
    ...(await runColdLoop(
      page,
      "tab→stories-cold",
      async () => {
        await page.evaluate(() => {
          for (const k of Object.keys(sessionStorage)) {
            if (k.includes("main-tab") || k.includes("visited")) sessionStorage.removeItem(k);
          }
        });
        await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
      },
      async () => {
        await spaTab(page, "/stories");
      },
      2,
    )),
  );
  await ensureTab(page, "/stories");
  await ensureTab(page, "/shuffle");
  all.push(
    ...(await runWarmLoop(page, "tab→stories-warm", async () => {}, async () => {
      await spaTab(page, "/stories");
    })),
  );

  // boost cold / warm
  await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
  all.push(
    ...(await runColdLoop(
      page,
      "tab→boost-cold",
      async () => {
        await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
      },
      async () => {
        await spaTab(page, "/boost");
      },
      2,
    )),
  );
  await ensureTab(page, "/boost");
  await ensureTab(page, "/shuffle");
  all.push(
    ...(await runWarmLoop(page, "tab→boost-warm", async () => {}, async () => {
      await spaTab(page, "/boost");
    })),
  );

  // Warm tab chain: stories → chats → boost → settings → stories (all pre-visited)
  await ensureTab(page, "/stories");
  await ensureTab(page, "/chats");
  await ensureTab(page, "/boost");
  await ensureTab(page, "/settings");
  const warmChain = [
    { pathId: "tab-chain→chats-warm", href: "/chats", prep: async () => { await ensureTab(page, "/stories"); } },
    { pathId: "tab-chain→boost-warm", href: "/boost", prep: async () => { await ensureTab(page, "/chats"); } },
    { pathId: "tab-chain→settings-warm", href: "/settings", prep: async () => { await ensureTab(page, "/boost"); } },
    { pathId: "tab-chain→stories-warm", href: "/stories", prep: async () => { await ensureTab(page, "/settings"); } },
  ];
  for (const step of warmChain) {
    all.push(
      ...(await runWarmLoop(page, step.pathId, step.prep, async () => {
        await spaTab(page, step.href);
      })),
    );
  }
  });
  }

  if (sectionEnabled("tab→settings-A", "tab→settings-B", "tab→settings-C", "tab→settings-D", "tab→settings-E")) {
  await safeSection(all, "tab→settings", async () => {
  // settings scenarios
  await ensureTab(page, "/settings");
  await page.waitForSelector("[data-nav-settings-primary]", { timeout: 30000 }).catch(() => undefined);
  await ensureTab(page, "/shuffle");

  all.push(
    ...(await runWarmLoop(page, "tab→settings-A", async () => {
      await ensureTab(page, "/stories");
    }, async () => {
      await spaTab(page, "/settings");
    })),
  );

  all.push(
    ...(await runWarmLoop(
      page,
      "tab→settings-B",
      async () => {
        await ensureTab(page, "/settings");
        await page.waitForTimeout(600);
        await page.evaluate(() => window.__sayittomeSettingsCache?.clearSession?.());
        await ensureTab(page, "/boost");
      },
      async () => {
        await spaTab(page, "/settings");
      },
      3,
    )),
  );

  await page.evaluate(() => window.__sayittomeSettingsCache?.clearSession?.());
  await ensureTab(page, "/settings");
  await page.waitForTimeout(800);
  all.push(
    ...(await runWarmLoop(
      page,
      "tab→settings-C",
      async () => {
        await ensureTab(page, "/boost");
        await page.evaluate(() => window.__sayittomeSettingsCache?.clearMemory?.());
      },
      async () => {
        await spaTab(page, "/settings");
      },
      3,
    )),
  );

  all.push(
    ...(await runColdLoop(
      page,
      "tab→settings-D",
      async () => {
        await page.evaluate(() => window.__sayittomeSettingsCache?.clear?.());
        await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
      },
      async () => {
        await spaTab(page, "/settings");
      },
      2,
    )),
  );

  // settings E (anonymous) — best-effort; may INVALID if session stays authenticated
  all.push(
    ...(await runColdLoop(
      page,
      "tab→settings-E",
      async () => {
        await page.evaluate(() => {
          window.__sayittomeSettingsCache?.clear?.();
          indexedDB.deleteDatabase("firebaseLocalStorageDb");
          localStorage.removeItem("firebase:authUser");
        });
        await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
      },
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
      },
      1,
    )),
  );
  });
  }

  if (
    sectionEnabled(
      "tray→viewer-preloaded",
      "tray→viewer-not-preloaded",
      "mosaic→viewer-preloaded",
      "story→next-preloaded",
      "story→next-not-decoded",
      "last-story→next-user-preloaded",
      "last-story→next-user-pending",
      "hardware-back",
    )
  ) {
  await safeSection(all, "stories-viewer", async () => {
  const entities = await discoverStoryEntities(page);
  if (!entities) {
    all.push({
      pathId: "stories-viewer",
      validation: { valid: false, reasons: ["missing:story-entities"] },
    });
    return;
  }

  const storyTrayHref = `/stories/${encodeURIComponent(entities.primaryOwnerUid)}`;
  const mosaicHref = `/stories/${encodeURIComponent(entities.secondaryOwnerUid)}`;

  const storyScenarios = [
    {
      pathId: "tray→viewer-preloaded",
      setup: async () => {
        await ensureTab(page, "/stories");
        await preloadStoryMediaBench(page, entities.primaryOwnerUid, entities.firstMediaUrl);
      },
      action: async () => {
        await page.locator(`a[href='${storyTrayHref}']`).first().click({ force: true });
      },
    },
    {
      pathId: "tray→viewer-not-preloaded",
      setup: async () => {
        await ensureTab(page, "/stories");
        await page.evaluate(() => window.__sayittomeStoriesBench?.clearPreload?.());
        await page.evaluate(() => window.__sayittomeStoryPipeline?.resetMedia?.());
      },
      action: async () => {
        await page.locator(`a[href='${storyTrayHref}']`).first().click({ force: true });
      },
    },
    {
      pathId: "mosaic→viewer-preloaded",
      setup: async () => {
        await ensureTab(page, "/stories");
        await preloadStoryMediaBench(page, entities.secondaryOwnerUid, entities.nextUserFirstMediaUrl);
      },
      action: async () => {
        await page.locator(`a[href='${mosaicHref}']`).first().click({ force: true });
      },
    },
    {
      pathId: "story→next-preloaded",
      setup: async () => {
        await ensureTab(page, "/stories");
        await page.locator(`a[href='${storyTrayHref}']`).first().click({ force: true });
        await page.waitForSelector("main.fixed.inset-0", { timeout: 30000 });
        if (entities.secondMediaUrl) {
          await preloadStoryMediaBench(page, entities.primaryOwnerUid, entities.secondMediaUrl);
        }
      },
      action: async () => {
        const viewer = page.locator("main.fixed.inset-0").first();
        const box = await viewer.boundingBox();
        if (!box) throw new Error("viewer-missing-for-next");
        await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
      },
    },
    {
      pathId: "story→next-not-decoded",
      setup: async () => {
        await ensureTab(page, "/stories");
        await page.evaluate(() => window.__sayittomeStoriesBench?.clearPreload?.());
        await page.locator(`a[href='${storyTrayHref}']`).first().click({ force: true });
        await page.waitForSelector("main.fixed.inset-0", { timeout: 30000 });
        await page.evaluate(() => window.__sayittomeStoryPipeline?.resetMedia?.());
      },
      action: async () => {
        const viewer = page.locator("main.fixed.inset-0").first();
        const box = await viewer.boundingBox();
        if (!box) throw new Error("viewer-missing-for-next");
        await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
      },
    },
    {
      pathId: "last-story→next-user-preloaded",
      setup: async () => {
        await ensureTab(page, "/stories");
        await page.locator(`a[href='${storyTrayHref}']`).first().click({ force: true });
        await page.waitForSelector("main.fixed.inset-0", { timeout: 30000 });
        if (entities.nextUserFirstMediaUrl) {
          await preloadStoryMediaBench(page, entities.secondaryOwnerUid, entities.nextUserFirstMediaUrl);
        }
        for (let i = 0; i < Math.max(0, (entities.primaryStoryCount || 1) - 1); i += 1) {
          const viewer = page.locator("main.fixed.inset-0").first();
          const box = await viewer.boundingBox().catch(() => null);
          if (!box) break;
          await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
          await page.waitForTimeout(120);
        }
      },
      action: async () => {
        const viewer = page.locator("main.fixed.inset-0").first();
        const box = await viewer.boundingBox();
        if (!box) throw new Error("viewer-missing-for-next-user");
        await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
      },
    },
    {
      pathId: "last-story→next-user-pending",
      setup: async () => {
        await ensureTab(page, "/stories");
        await page.evaluate(() => window.__sayittomeStoriesBench?.clearPreload?.());
        await page.locator(`a[href='${storyTrayHref}']`).first().click({ force: true });
        await page.waitForSelector("main.fixed.inset-0", { timeout: 30000 });
        for (let i = 0; i < Math.max(0, (entities.primaryStoryCount || 1) - 1); i += 1) {
          const viewer = page.locator("main.fixed.inset-0").first();
          const box = await viewer.boundingBox().catch(() => null);
          if (!box) break;
          await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
          await page.waitForTimeout(120);
        }
        await page.evaluate(() => window.__sayittomeStoryPipeline?.resetMedia?.());
      },
      action: async () => {
        const viewer = page.locator("main.fixed.inset-0").first();
        const box = await viewer.boundingBox();
        if (!box) throw new Error("viewer-missing-for-next-user-pending");
        await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.5);
      },
    },
  ];

  for (const scenario of storyScenarios) {
    if (onlyFilter && !scenario.pathId.includes(onlyFilter) && scenario.pathId !== onlyFilter) continue;
    all.push(
      ...(await runWarmLoop(
        page,
        scenario.pathId,
        async () => {
          if (!page.url().includes("/stories") && !page.url().includes("/stories/")) {
            await ensureTab(page, "/stories");
          }
          await scenario.setup();
        },
        async () => {
          await scenario.action();
        },
        3,
      )),
    );
  }

  // hardware back
  await page.goto(`${baseUrl}/shuffle`, { waitUntil: "domcontentloaded" });
  await seedProfileCache(page, pinnedUsername);
  all.push(
    ...(await runWarmLoop(
      page,
      "hardware-back",
      async () => {
        if (!page.url().includes("/u/")) {
          await openPinnedProfile(page, pinnedUsername);
        }
      },
      async () => {
        await page.evaluate(() => window.dispatchEvent(new Event("sayittomeHardwareBack")));
      },
      3,
    )),
  );
  });
  }

  } catch (error) {
    console.error("runAllScenarios partial error:", error);
  }

  return all;
}

function validateBackLockProbe(probe) {
  if (!probe?.length) return null;

  return {
    model: "same-path-dedupe (not global BACK_LOCK block)",
    rows: probe.map((row) => {
      const samePathDuplicateOk =
        row.gapMs <= 120 &&
        row.firstBackNavigated &&
        !row.secondBackNavigated &&
        row.eventsDiscarded > 0;
      const changedPathSecondBackOk =
        row.gapMs >= 150 ? row.secondBackNavigated === true : null;

      return {
        gapMs: row.gapMs,
        pathnameBefore: row.pathnameBefore,
        pathnameAfterFirst: row.pathnameAfterFirst,
        pathnameAfterSecond: row.pathnameAfterSecond,
        firstBackNavigated: row.firstBackNavigated,
        secondBackNavigated: row.secondBackNavigated,
        eventsDiscarded: row.eventsDiscarded,
        eventsNavigated: row.eventsNavigated,
        samePathDuplicateOk,
        changedPathSecondBackOk,
        probeLog: row.probeLog,
      };
    }),
    passed:
      probe.every((row) => row.firstBackNavigated) &&
      probe.filter((row) => row.gapMs <= 120).every((row) => row.eventsDiscarded > 0 || !row.secondBackNavigated) &&
      probe.filter((row) => row.gapMs >= 150).every((row) => row.secondBackNavigated),
  };
}

function buildReport(allSamples, meta, backLockProbe, samePathBackProbe) {
  const pathIds = [...new Set(allSamples.map((s) => s.pathId))];
  const scenarios = {};
  const invalidSamples = [];
  const validSamples = [];

  for (const row of allSamples) {
    const sample = row.sample || row;
    const enriched = {
      ...sample,
      pathId: row.pathId || sample.pathId,
      validation: row.validation,
      pipeline: {
        chats: row.chats || null,
        settings: row.settings || null,
        profile: row.profile || null,
        story: row.story || null,
      },
      storyEntities: row.storyEntities || null,
      navMeta: row.navMeta || null,
    };
    if (enriched.validation?.valid) validSamples.push(enriched);
    else invalidSamples.push(enriched);
  }

  for (const pathId of pathIds) {
    scenarios[pathId] = {
      ...summarizeValid(allSamples.map((r) => ({ ...r, ...(r.sample || {}), validation: r.validation, pathId: r.pathId })), pathId),
      rules: SCENARIO_RULES[pathId] || null,
      invalidReasons: allSamples
        .filter((s) => s.pathId === pathId && !s.validation?.valid)
        .map((s) => ({ runIndex: s.runIndex, reasons: s.validation?.reasons || ["unknown"] })),
    };
  }

  const warmRows = Object.values(scenarios).filter((s) => !String(s.pathId).includes("cold") && s.validCount > 0);
  const byWarmMedian = [...warmRows].sort((a, b) => (a.median || 9999) - (b.median || 9999));
  const byP95 = [...warmRows].sort((a, b) => (a.p95 || 9999) - (b.p95 || 9999));

  return {
    metadata: {
      ...meta,
      methodologyNote: METHODOLOGY_NOTE,
      invalidLegacyBaselines: {
        "shuffle→profile-cached": "530ms INVALID — cache cleared between samples / unstable username",
        "profile→chat-cached": "30s INVALID — broken benchmark selector timeout; valid baseline ~62ms after data-nav-profile-chat instrumentation fix",
        "tab→chats": "527ms SUSPECT — pending valid reproduction",
        "tab→settings": "452ms SUSPECT — pending valid reproduction",
        "tray→viewer-preloaded": "~8s SUSPECT — do not classify as network limit until preload phases verified",
        firestoreTimeout45s: "INVALID — broken preconditions, not Firestore latency",
      },
      benchmarkFixesNotProductionOptimizations: [
        "data-nav-profile-chat fixes measurement selector; not a UX optimization",
        "data-nav-tab fixes shuffle bottom-nav detection; not a UX optimization",
      ],
      validProfileWarmCachedMs: "19-21ms median with verified profile-cache-hit",
    },
    scenarios,
    validSamples,
    invalidSamples,
    rankings: { byWarmMedian, byP95 },
    backLockProbe,
    backLockValidation: validateBackLockProbe(backLockProbe),
    samePathBackProbe,
  };
}

async function main() {
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    // ignore
  }

  const browser = await chromium.launch({ headless: true });
  const device = devices["Pixel 5"];
  const contextOptions = { ...device, locale: "es-AR" };
  if (fs.existsSync(storageStateFile)) {
    contextOptions.storageState = storageStateFile;
  }
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  if (cpuThrottle) {
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  }

  await prepareBenchSession(page);
  let pinnedUsername = "";
  try {
    pinnedUsername = await pinShuffleProfileUsername(page);
  } catch {
    try {
      await seedProfileCache(page, BENCH_USERNAME);
      pinnedUsername = BENCH_USERNAME;
    } catch {
      pinnedUsername = BENCH_USERNAME;
    }
  }
  await ensureShuffleReady(page);

  let allSamples = [];
  try {
    allSamples = await runAllScenarios(page, pinnedUsername);
  } catch (error) {
    console.error("runAllScenarios error (partial results kept):", error);
  }
  const backLockProbe = skipBackLock
    ? null
    : await runBackLockProbe(page, pinnedUsername).catch((error) => {
        console.error("backLockProbe error:", error);
        return null;
      });
  const samePathBackProbe = skipBackLock
    ? null
    : await runSamePathBackProbe(page).catch((error) => {
        console.error("samePathBackProbe error:", error);
        return null;
      });

  const meta = {
    commit,
    measuredAt: new Date().toISOString(),
    baseUrl,
    device: "Pixel 5",
    viewport: device.viewport,
    cpuThrottle,
    warmRunsRequested: warmRuns,
    traceEnabled: true,
    buildFlags: { NEXT_PUBLIC_NAV_TRACE: "1" },
    cpuOnly,
    deferInboxFlag: deferInboxFlag || null,
    chatsDeferCompare,
  };

  const report = buildReport(allSamples, meta, backLockProbe, samePathBackProbe);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  if (process.env.BENCH_SAVE_STORAGE_STATE === "1") {
    await context.storageState({ path: storageStateFile });
  }

  console.log(JSON.stringify({ rankings: report.rankings, scenarios: report.scenarios }, null, 2));
  console.log(`Wrote ${outFile}`);
  console.log(`Valid: ${report.validSamples.length}  Invalid: ${report.invalidSamples.length}`);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
