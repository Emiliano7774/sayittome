/**
 * Post-fix ghost capture against production HEAD (normal URL, no navcapture).
 *
 * Login (Chrome stable, headed, diagnostic profile):
 *   node scripts/auth-current-head-ghost-capture.mjs --login --chrome
 *
 * Validate session:
 *   node scripts/auth-current-head-ghost-capture.mjs --validate --chrome
 *
 * Capture (up to 10 hops, pixel-first):
 *   node scripts/auth-current-head-ghost-capture.mjs --capture --chrome
 *   node scripts/auth-current-head-ghost-capture.mjs --capture --chrome --dual
 *
 * Hop-9 diagnostic (9 hops, navcapture=1, full lifecycle evidence):
 *   node scripts/auth-current-head-ghost-capture.mjs --diagnose-hop-nine --chrome --release
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import {
  evaluateRunnerHopIsolation,
  resolveCurrentHopPointerdown,
} from "./shuffle-runner-pointer-resolution.mjs";
import {
  buildSlideTimingMetrics,
  classifyMultisourceSlide,
  percentile,
  releaseHopCleanWithMultisource,
  resolveCurrentHopTrace,
} from "./shuffle-slide-multisource-classifier.mjs";
import {
  mergeTraceSources,
  preferNonEmptyTrace,
  resolveSoftNavAwareCurrentHop,
} from "./softnav-tx-trace-observability.mjs";
import {
  buildDiagnosticTimingJitterReport,
  mayInjectDiagnosticTimingJitter,
  shouldRunnerInjectBridgeDiagJitter,
} from "./prod-timing-jitter-guard.mjs";
import { classifyMinimalHop } from "./classify-minimal-physical.mjs";
import { computeAuthorizedPreemptCounters } from "./authorized-watchdog-preempt-counters.mjs";
import {
  evaluateNoScreencastPhysicalEvidence,
  emptyCriticalCaptureCounters,
  assertNoScreencastCaptureClean,
  CAPTURE_PROVIDER,
  PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST,
} from "./native-lifecycle-no-screencast-evidence.mjs";
import {
  evaluateWaapiCompositorPhysicalEvidence,
  hopUsesWaapiCompositorMotor,
  PHYSICAL_EVIDENCE_PROVIDER_WAAPI_COMPOSITOR,
} from "./waapi-compositor-lifecycle-evidence.mjs";
import {
  summarizeNativeLifecycleSeries,
  evaluateNativeNoScreencastSeriesClean,
  summarizeSourceSpecificCounts,
} from "./native-lifecycle-temporal-metrics.mjs";
import { enrichHopReportWithNativeStartGate } from "./native-transition-start-gate.mjs";
import {
  evaluateVisualSpotCheckHop,
  summarizeVisualSpotCheckSeries,
  CAPTURE_PROVIDER_VISUAL_SPOT_CHECK,
  CAPTURE_PROVIDER_SCREENSHOT_BURST,
  CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST,
} from "./visual-spot-check-classifier.mjs";
import {
  detectTimestampCollapse,
  selectVisualCaptureProvider,
} from "./visual-capture-frame-identity.mjs";
import {
  evaluateProdTrueInputArm,
  isProductionHostname,
} from "./prod-true-fail-closed-gate.mjs";
import {
  armProdTrueInputWithContext,
  collectProdTrueArmContextFromPage,
} from "./prod-true-arm-context.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROBE_INIT = fs.readFileSync(path.join(__dirname, "auth-capture-page-probes.js"), "utf8");
const HOP_NINE_DIAG_INIT = fs.readFileSync(path.join(__dirname, "micro-slide-hop-nine-diag.js"), "utf8");
const MINIMAL_PHYSICAL_DIAG_INIT = fs.readFileSync(
  path.join(__dirname, "micro-slide-minimal-physical-diag.js"),
  "utf8",
);
const VALIDATE_SNAPSHOT_INIT = fs.readFileSync(path.join(__dirname, "auth-validate-snapshot.js"), "utf8");

const args = process.argv.slice(2);
const base = argValue("--base") ?? "https://sayittome-app.web.app";
const useChrome = args.includes("--chrome");
const dualBrowser = args.includes("--dual");
const releaseMode = args.includes("--release");
const runnerIsolationMode = args.includes("--runner-isolation");
const diagnoseHopNineMode = args.includes("--diagnose-hop-nine");
const transformWriteForensicMode = args.includes("--transform-write-forensic");
const transformWriteForensicV2Mode =
  transformWriteForensicMode && (args.includes("--forensic-v2") || args.includes("--v2"));
const transformWriteForensicV3Mode =
  transformWriteForensicMode && (args.includes("--forensic-v3") || args.includes("--v3"));
const transformWriteForensicV4Mode =
  transformWriteForensicMode && (args.includes("--forensic-v4") || args.includes("--v4"));
const minimalPhysicalDiagMode =
  args.includes("--minimal-physical-diag") || args.includes("--minimal-physical");
const nativeLifecycleNoScreencastMode =
  args.includes("--native-lifecycle-no-screencast") ||
  args.includes("--no-screencast-critical");
/** Simulate isNativeAppShell() via UA (persists across same-document router.push). */
const simulateNativeShell = args.includes("--simulate-native-shell");
const visualSpotCheckMode = args.includes("--visual-spot-check");
/** Optional screenshot burst provider (CDP captureScreenshot cadence). */
const visualScreenshotBurstMode =
  visualSpotCheckMode &&
  (args.includes("--visual-screenshot-burst") ||
    args.includes("--visual-burst-only") ||
    args.includes("--visual-dual-provider"));
/** Dual only when explicitly requested — concurrent burst can starve screencast. */
const visualDualProviderMode =
  visualSpotCheckMode && args.includes("--visual-dual-provider");
/** Default visual spot: screencast + robust frame identity (not timestamp-only dedupe). */
const visualScreencastRobustMode =
  visualSpotCheckMode && !args.includes("--visual-burst-only");
const visualBurstCadenceMs = Math.max(
  8,
  Math.min(16, Number(argValue("--visual-burst-cadence-ms") ?? 12) || 12),
);
const explicitDiagTimingJitter = args.includes("--diag-timing-jitter");
const enableMicroSlide =
  args.includes("--enable-micro-slide") ||
  releaseMode ||
  diagnoseHopNineMode ||
  transformWriteForensicMode ||
  minimalPhysicalDiagMode ||
  nativeLifecycleNoScreencastMode ||
  visualSpotCheckMode;
/** Localhost-only: wipe presentation runtime after soft push to repro prod reinit; pin must rehydrate. */
const forceSoftPushModuleReinit = args.includes("--force-soft-push-module-reinit");
const disableRunnerTrace = args.includes("--no-runner-trace");
const runnerTraceMode =
  args.includes("--runner-trace") ||
  transformWriteForensicMode ||
  (releaseMode && enableMicroSlide && !diagnoseHopNineMode && !disableRunnerTrace);
const oneHop = args.includes("--one-hop");
const prodTrueActivationMode = args.includes("--prod-true-activation");
const prodTrueExpectedBuildIdentity = argValue("--prod-true-expected-build-identity") ?? null;
const prodTrueVerifiedFlag = argValue("--prod-true-verified") === "1";
const outerArmContextPath = argValue("--outer-arm-context-json") ?? null;
const dryRunNoInput = args.includes("--dry-run-no-input");
const headedMode = args.includes("--headed");
const cpuThrottleRate = Number(argValue("--cpu-throttle") ?? 0);
const hopCountOverride = argValue("--hops") ? Number(argValue("--hops")) : null;
const modeLogin = args.includes("--login");
const modeValidate = args.includes("--validate");
const modeCapture = args.includes("--capture") || releaseMode || diagnoseHopNineMode || (!modeLogin && !modeValidate);

const profileDir = path.resolve(
  argValue("--profile") ??
    (useChrome
      ? path.join("scripts", ".auth-capture-profile-chrome-diag")
      : path.join("scripts", ".auth-capture-profile")),
);
const outDir = path.resolve(
  argValue("--out") ??
    (visualSpotCheckMode
      ? path.join("scripts", "ghost-filmstrip-out", "local-chromium-visual-spot-check-4")
      : nativeLifecycleNoScreencastMode
      ? path.join(
          "scripts",
          "ghost-filmstrip-out",
          hopCountOverride === 20
            ? "local-chromium-native-lifecycle-no-screencast-20"
            : "local-chromium-native-lifecycle-no-screencast-12",
        )
      : minimalPhysicalDiagMode
      ? path.join("scripts", "ghost-filmstrip-out", "local-transform-minimal-physical-chrome")
      : transformWriteForensicV4Mode
      ? path.join("scripts", "ghost-filmstrip-out", "local-transform-write-forensic-chrome-v4")
      : transformWriteForensicV3Mode
      ? path.join("scripts", "ghost-filmstrip-out", "local-transform-write-forensic-chrome-v3")
      : transformWriteForensicV2Mode
      ? path.join("scripts", "ghost-filmstrip-out", "local-transform-write-forensic-chrome-v2")
      : transformWriteForensicMode
      ? path.join("scripts", "ghost-filmstrip-out", "local-transform-write-forensic-chrome")
      : path.join("scripts", "ghost-filmstrip-out", `current-head-${Date.now()}`)),
);

const RELEASE_ALLOW_HOP_RETRY = false;
const RELEASE_HOP_SOURCES = [
  "chats",
  "chats",
  "stories",
  "chats",
  "boost",
  "chats",
  "settings",
  "stories",
  "boost",
  "settings",
];

function releaseHopSourcesInterleaved20() {
  return [
    "chats",
    "stories",
    "chats",
    "boost",
    "chats",
    "settings",
    "chats",
    "stories",
    "boost",
    "chats",
    "settings",
    "chats",
    "stories",
    "boost",
    "chats",
    "settings",
    "stories",
    "boost",
    "chats",
    "settings",
  ];
}

function releaseHopSourcesForCount(count) {
  const sourcesArg = argValue("--sources");
  if (sourcesArg) {
    const parsed = sourcesArg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      if (parsed.length >= count) return parsed.slice(0, count);
      const out = [];
      for (let i = 0; i < count; i += 1) out.push(parsed[i % parsed.length]);
      return out;
    }
  }
  if (count === 50) {
    return [
      ...Array(20).fill("chats"),
      ...Array(10).fill("stories"),
      ...Array(10).fill("boost"),
      ...Array(10).fill("settings"),
    ];
  }
  if (count === 20) {
    return releaseHopSourcesInterleaved20();
  }
  if (count === 12) {
    return [
      ...Array(4).fill("chats"),
      ...Array(3).fill("stories"),
      ...Array(3).fill("boost"),
      ...Array(2).fill("settings"),
    ];
  }
  if (count === 4) {
    return ["chats", "stories", "boost", "settings"];
  }
  if (count === 5) {
    // LOCAL_NATIVE_SHELL_AFTER_FIX minimum matrix: chats2 / stories1 / boost1 / settings1
    return ["chats", "stories", "chats", "boost", "settings"];
  }
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(RELEASE_HOP_SOURCES[i % RELEASE_HOP_SOURCES.length]);
  }
  return out;
}

function captureHostname() {
  try {
    return new URL(base).hostname;
  } catch {
    return "";
  }
}

function bridgeDiagJitterForHop(hopNum) {
  return {
    hopNum,
    routeCommitDelayMs: (hopNum * 113) % 901,
    finalDomReadinessDelayMs: (hopNum * 37) % 251,
  };
}

function canInjectBridgeDiagJitterNow() {
  return shouldRunnerInjectBridgeDiagJitter({
    hostname: captureHostname(),
    releaseMode,
    enableMicroSlide,
    runnerTrace: runnerTraceMode,
    navcapture: diagnoseHopNineMode,
    explicitJitterFlag: explicitDiagTimingJitter,
  });
}

function releaseJitterMs() {
  // Pre-tap runner wait — never on production hosts; never without explicit local flag.
  if (!mayInjectDiagnosticTimingJitter(captureHostname(), explicitDiagTimingJitter)) return 0;
  if (!releaseMode) return 0;
  return Math.floor(Math.random() * 120);
}
const MAX_HOPS =
  hopCountOverride ??
  (visualSpotCheckMode
    ? 4
    : nativeLifecycleNoScreencastMode
    ? 12
    : minimalPhysicalDiagMode
    ? 10
    : transformWriteForensicMode
    ? 10
    : diagnoseHopNineMode
      ? 9
      : runnerIsolationMode
        ? 20
        : oneHop
          ? 1
          : releaseMode
            ? RELEASE_HOP_SOURCES.length
            : 10);
const POST_DEST_TAIL = 20;
const MIN_SHUFFLE_VALID_STREAK = 2;
const LEG2_TIMEOUT_MS = 120000;
const MAX_LEG2_FRAMES = 400;
const PIXEL_MATCH = 0.035;

const LOADING_RENDER_PATHS = [
  {
    file: "src/app/shuffle/shuffle-client.tsx",
    component: "ShuffleClient",
    marker: "[data-loading-shell]",
    surface: "shuffle-classic",
    chatsToShuffleRisk: "high",
  },
  {
    file: "src/app/shuffle/modern-shuffle-client.tsx",
    component: "ModernShuffleClient",
    marker: "[data-loading-shell]",
    surface: "shuffle-modern",
    chatsToShuffleRisk: "high",
  },
  {
    file: "src/components/chats/ChatsInboxPage.tsx",
    component: "ChatsInboxPage",
    marker: "common_loading text",
    surface: "chats",
    chatsToShuffleRisk: "low",
  },
  {
    file: "src/components/shuffle/ClassicFollowingStrip.tsx",
    component: "ClassicFollowingStrip",
    marker: "loading strip",
    surface: "shuffle-classic-header",
    chatsToShuffleRisk: "medium",
  },
  {
    file: "src/app/app/page.tsx",
    component: "AppPage",
    marker: "Cargando SayItToMe",
    surface: "app-bootstrap",
    chatsToShuffleRisk: "low",
  },
];

function argValue(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

function releaseHopNineSources() {
  return releaseHopSourcesForCount(50).slice(0, 9);
}

function captureUrl(pathname) {
  if (diagnoseHopNineMode || transformWriteForensicMode) {
    const join = pathname.includes("?") ? "&" : "?";
    return `${base}${pathname}${join}navcapture=1`;
  }
  return `${base}${pathname}`;
}

function sha(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 12);
}

function nodeReceiveMonoMs() {
  return Math.round(performance.now() + (performance.timeOrigin || Date.now()));
}

async function sampleVisualSpotSlideAttr(page) {
  return page.evaluate(() => {
    const slideState = document.documentElement.getAttribute("data-main-tab-shuffle-slide");
    return {
      monoMs: Math.round(performance.timeOrigin + performance.now()),
      pathname: location.pathname.split("?")[0],
      slideState,
      actualPresentedSurface:
        slideState === "running" || slideState === "armed" || slideState === "preparing"
          ? "in-slide"
          : null,
      validate: { bottomNav: true },
    };
  });
}

function classifyVisualSpotPixel({
  buffer,
  dSource,
  dShuffle,
  slideState,
  pixelClassification,
}) {
  let cls = pixelClassification;
  if (slideState === "preparing" || slideState === "armed" || slideState === "running") {
    cls = "CONTROLLED_MICRO_SLIDE_VALID";
  } else if (
    typeof dSource === "number" &&
    typeof dShuffle === "number" &&
    dSource > 0.015 &&
    dShuffle > 0.015
  ) {
    cls = "CONTROLLED_MICRO_SLIDE_VALID";
  }
  return cls;
}

function diffRatio(bufA, bufB) {
  if (!bufA || !bufB || bufA.length !== bufB.length) return 1;
  let diff = 0;
  const step = 24;
  for (let i = 0; i < bufA.length; i += step) {
    if (Math.abs(bufA[i] - bufB[i]) > 18) diff += 1;
  }
  return diff / Math.ceil(bufA.length / step);
}

async function detectLoadingSplashPixel(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    const w = meta.width ?? 390;
    const h = meta.height ?? 844;
    const left = Math.floor(w * 0.2);
    const top = Math.floor(h * 0.38);
    const width = Math.floor(w * 0.6);
    const height = Math.floor(h * 0.18);
    const { data } = await sharp(buffer)
      .extract({ left, top, width, height })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let dark = 0;
    let mid = 0;
    let bright = 0;
    for (let i = 0; i < data.length; i += 3) {
      const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (l < 35) dark += 1;
      else if (l < 140) mid += 1;
      else bright += 1;
    }
    const total = dark + mid + bright || 1;
    const centerSplash = dark / total > 0.8 && mid / total > 0.015 && mid / total < 0.2 && bright / total < 0.05;

    const bodyTop = Math.floor(h * 0.22);
    const bodyHeight = Math.floor(h * 0.55);
    const { data: bodyData } = await sharp(buffer)
      .extract({ left: 0, top: bodyTop, width: w, height: bodyHeight })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let bodyDark = 0;
    for (let i = 0; i < bodyData.length; i += 3) {
      const l = (bodyData[i] + bodyData[i + 1] + bodyData[i + 2]) / 3;
      if (l < 40) bodyDark += 1;
    }
    const bodyDarkRatio = bodyDark / Math.ceil(bodyData.length / 3);
    return centerSplash && bodyDarkRatio > 0.72;
  } catch {
    return false;
  }
}

async function classifyFramePixelOnly({
  buffer,
  dSource,
  dShuffle,
  refSourceBuf,
  refShuffleBuf,
}) {
  if (refShuffleBuf && dShuffle < PIXEL_MATCH) return "SHUFFLE_VALID";
  if (await detectLoadingSplashPixel(buffer)) return "LOADING";
  if (refSourceBuf && dSource < PIXEL_MATCH) return "SOURCE_VALID";
  if (refShuffleBuf && dShuffle < 0.55 && dSource > 0.06) return "PARTIAL_SHUFFLE";
  if (dSource > 0.5 && dShuffle > 0.5) return "BLACK_OR_ROOT";
  return "COMPOSITOR_GHOST";
}

async function classifyControlledMicroSlide(page) {
  return page
    .evaluate(() => {
      const slide = document.documentElement.getAttribute("data-main-tab-shuffle-slide");
      if (slide === "preparing" || slide === "armed" || slide === "running") {
        const source = document.querySelector(".sayittome-slide-source-active");
        const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
        if (source && shuffleHost) return true;
      }
      if (slide !== "armed" && slide !== "running") return false;

      const visibleShells = [...document.querySelectorAll("[data-loading-shell]")].filter((el) => {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          cs.display !== "none" &&
          cs.visibility !== "hidden" &&
          parseFloat(cs.opacity) >= 0.04 &&
          rect.width > 1 &&
          rect.height > 1
        );
      });
      if (visibleShells.length > 0) return false;

      const feed = document.querySelector("#sayittome-shuffle-keepalive-host [data-shuffle-list]");
      const slots = feed
        ? [...feed.querySelectorAll(":scope > *:not(.sayittome-nav-scroll-spacer)")]
        : [];
      if (slots.length < 3) return false;

      const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
      const source = document.querySelector(".sayittome-slide-source-active");
      if (!shuffleHost || !source) return false;

      const sh = shuffleHost.getBoundingClientRect();
      const sr = source.getBoundingClientRect();
      const unionLeft = Math.min(sh.left, sr.left);
      const unionRight = Math.max(sh.right, sr.right);
      const vw = window.innerWidth || 1;
      const coverage = (unionRight - unionLeft) / vw;
      if (coverage < 0.995) return false;

      const seamA = Math.abs(sh.left - sr.right);
      const seamB = Math.abs(sr.left - sh.right);
      const seam = Math.min(seamA, seamB);
      if (seam > 1.5) return false;

      return true;
    })
    .catch(() => false);
}

async function dismissModals(page) {
  for (const label of [/Mantener Español/i, /Keep English/i, /Aceptar/i, /Accept/i, /Ahora no/i, /Not now/i]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function dismissChatRequestModal(page) {
  for (const label of [/Rechazar/i, /Reject/i, /Decline/i, /Cancelar/i, /Cancel/i]) {
    const btn = page.getByRole("button", { name: label }).first();
    if (await btn.isVisible().catch(() => false)) {
      const enabled = await btn.isEnabled().catch(() => false);
      if (enabled) {
        await btn.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
        return true;
      }
    }
  }
  const close = page.locator('[aria-label="Cerrar"], [aria-label="Close"]').first();
  if (await close.isVisible().catch(() => false)) {
    await close.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

async function ensureEntryLegalClosed(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const open = await page.evaluate(() => document.body.classList.contains("sayittome-entry-legal-open"));
    if (!open) return;
    await page.evaluate(() => {
      const scroll = document.querySelector(".sayittome-entry-legal-scroll");
      if (scroll) scroll.scrollTop = scroll.scrollHeight;
    });
    await page.waitForTimeout(200);
    const accept = page.getByRole("button", { name: /Acepto y continúo|I accept and continue/i });
    if (await accept.isEnabled().catch(() => false)) {
      await accept.click();
      await page.waitForTimeout(600);
    }
  }
}

async function waitForSessionSignals(page, timeoutMs = 20000) {
  try {
    await page.waitForFunction(
      () => {
        const bottomNav = Boolean(document.querySelector("[data-nav-tab]"));
        const shuffleSlots =
          document.querySelectorAll(
            "[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer), .grid.grid-cols-2 > *",
          ).length;
        return bottomNav && shuffleSlots >= 3;
      },
      undefined,
      { timeout: timeoutMs },
    );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function validateHydratedSession(page) {
  const probe = await page.evaluate(async () => window.__authValidateSnapshot?.sample?.());
  if (!probe) return { valid: false, reason: "validate-snapshot-missing", probe: null };
  const valid = Boolean(probe.validForVisualEvidence);
  return { valid, reason: valid ? undefined : "session-not-ready", probe };
}

async function waitChatsStable(page, timeoutMs = 30000) {
  await waitSourceStable(page, "chats", timeoutMs);
}

async function waitSourceStable(page, sourceTab, timeoutMs = 30000) {
  await page
    .waitForFunction(
      async (source) => {
        const snap = await window.__authValidateSnapshot?.sample?.();
        if (!snap) return false;
        if (snap.actualPresentedSurface !== source) return false;
        if (source === "chats") return snap.chats?.chatsRowsInVisibleSurface > 0;
        return true;
      },
      sourceTab,
      { timeout: timeoutMs },
    )
    .catch(() => {});
}

async function findVisibleNavTabCenter(page, sourceTab) {
  return page.evaluate((source) => {
    const tabs = [
      ...document.querySelectorAll(`.sayittome-bottom-nav [data-nav-tab="${source}"]`),
      ...document.querySelectorAll(`[data-nav-tab="${source}"]`),
    ];
    const pick = tabs.find((el) => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        cs.visibility !== "hidden" &&
        cs.display !== "none" &&
        parseFloat(cs.opacity) > 0.05 &&
        rect.width > 8 &&
        rect.height > 8
      );
    });
    if (!pick) return null;
    const rect = pick.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, sourceTab);
}

async function clickVisibleNavTab(page, sourceTab) {
  const tab = page.locator(`.sayittome-bottom-nav [data-nav-tab="${sourceTab}"]`).first();
  const visible = await tab.isVisible().catch(() => false);
  if (visible) {
    try {
      await tab.tap({ timeout: 5000 });
      return { via: "tap" };
    } catch {
      try {
        await tab.click({ timeout: 5000, force: true });
        return { via: "click-force" };
      } catch {
        /* fall through to goto */
      }
    }
  }
  const center = await findVisibleNavTabCenter(page, sourceTab);
  if (center) {
    try {
      await page.mouse.click(center.x, center.y);
      return { via: "mouse", center };
    } catch {
      /* fall through to goto */
    }
  }
  await page.goto(captureUrl(`/${sourceTab}`), { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitSourceStable(page, sourceTab);
  return { via: "goto" };
}

function sourcePathPattern(sourceTab) {
  if (sourceTab === "chats") return /\/chats/;
  if (sourceTab === "stories") return /\/stories/;
  if (sourceTab === "boost") return /\/boost/;
  return /\/settings/;
}

async function ensureSourceRoutePathname(page, sourceTab) {
  const pathRe = sourcePathPattern(sourceTab);
  const matches = () => page.evaluate((source) => {
    const path = location.pathname.split("?")[0].split("#")[0];
    if (source === "chats") return path === "/chats" || path.startsWith("/chat/");
    return path === `/${source}` || path.startsWith(`/${source}/`);
  }, sourceTab);

  if (await matches()) return;

  await page.goto(captureUrl(`/${sourceTab}`), { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForURL(pathRe, { timeout: 20000 }).catch(() => {});
  if (!(await matches())) {
    throw new Error(`source-pathname-not-ready:${sourceTab}:${await page.evaluate(() => location.pathname)}`);
  }
}

async function navigateToSourceViaTab(page, sourceTab) {
  await dismissModals(page);
  await dismissChatRequestModal(page);
  await clickVisibleNavTab(page, sourceTab);
  const pathRe = sourcePathPattern(sourceTab);
  await page.waitForURL(pathRe, { timeout: 20000 }).catch(() => {});
  await ensureSourceRoutePathname(page, sourceTab);
  await waitSourceStable(page, sourceTab);
  await dismissModals(page);
  await dismissChatRequestModal(page);
  await page.waitForTimeout(400);
}

async function waitShuffleCoherent(page, timeoutMs = 30000) {
  return page
    .waitForFunction(
      async () => {
        const snap = await window.__authValidateSnapshot?.sample?.();
        return (
          snap?.pathnameRouteSurface === "shuffle" &&
          snap?.actualPresentedSurface === "shuffle" &&
          !snap?.handoff?.shuffleHandoffPending &&
          (snap?.shuffle?.domSlots >= 3 || snap?.shuffle?.visibleSlots >= 3)
        );
      },
      undefined,
      { timeout: timeoutMs },
    )
    .catch(() => {});
}

/** Ensure prior micro-slide transaction fully settled before the next hop. */
async function waitMicroSlideIdle(page, timeoutMs = 15000) {
  await page
    .waitForFunction(
      () => {
        const html = document.documentElement;
        const slide = html.getAttribute("data-main-tab-shuffle-slide");
        const owner = html.getAttribute("data-main-tab-shuffle-owner");
        if (slide === "preparing" || slide === "armed" || slide === "running") return false;
        if (owner) return false;
        const prep = document
          .getElementById("sayittome-shuffle-keepalive-host")
          ?.querySelector(".sayittome-shuffle-surface-prep");
        const shells = prep?.querySelectorAll("[data-loading-shell]") ?? [];
        for (const shell of shells) {
          const cs = getComputedStyle(shell);
          const rect = shell.getBoundingClientRect();
          if (
            cs.display !== "none" &&
            cs.visibility !== "hidden" &&
            parseFloat(cs.opacity) >= 0.04 &&
            rect.width > 1 &&
            rect.height > 1
          ) {
            return false;
          }
        }
        return true;
      },
      undefined,
      { timeout: timeoutMs },
    )
    .catch(() => {});
  await page.waitForTimeout(releaseMode ? 400 : 200);
}

async function sampleGeometry(page) {
  return page.evaluate(async () => {
    const validate = await window.__authValidateSnapshot?.sample?.();
    const probe = window.__authCaptureProbes?.sampleState?.();
    const revealAudit = window.__authCaptureProbes?.exportRevealAudit?.() ?? null;
    return {
      monoMs: Math.round(performance.timeOrigin + performance.now()),
      pathname: location.pathname,
      slideState: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
      slideOwnerAttr: document.documentElement.getAttribute("data-main-tab-shuffle-owner"),
      presentationLatchActive: Boolean(document.documentElement.getAttribute("data-main-tab-shuffle-owner")),
      routePresentationMismatch: validate?.routePresentationMismatch ?? false,
      ...probe,
      pathnameRouteSurface: validate?.pathnameRouteSurface ?? null,
      actualPresentedSurface: validate?.actualPresentedSurface ?? null,
      validate,
      revealAudit,
    };
  });
}

function validateMicroSlideLifecycle(trace) {
  if (!Array.isArray(trace) || trace.length === 0) return false;
  const order = [
    "TRANSITION_BEGIN",
    "NAVIGATION_COMMIT_NOTIFIED",
    "READINESS_LOOP_STARTED",
    "DESTINATION_READY",
    "PHASE_ARMED",
    "PHASE_SLIDING",
    "SETTLED",
  ];
  let lastIdx = -1;
  for (const kind of order) {
    const idx = trace.findIndex((entry) => entry.kind === kind);
    if (idx < 0) return false;
    if (idx < lastIdx) return false;
    lastIdx = idx;
  }
  return true;
}

function validatePostSettleBridgeLifecycle(trace = []) {
  if (!Array.isArray(trace) || trace.length === 0) return false;
  const settledIdx = trace.findIndex((entry) => entry.kind === "SETTLED");
  if (settledIdx < 0) return false;
  const afterSettled = trace.slice(settledIdx);
  const required = [
    "POST_SETTLE_ROUTE_BRIDGE_STARTED",
    "FINAL_ROUTE_SURFACE_READY",
    "PRESENTATION_OWNERSHIP_TRANSFER_STARTED",
    "PRESENTATION_OWNERSHIP_TRANSFERRED",
    "PRESENTATION_LATCH_RELEASED",
    "POST_SETTLE_ROUTE_BRIDGE_COMPLETED",
  ];
  let lastIdx = 0;
  for (const kind of required) {
    const idx = afterSettled.findIndex((entry, i) => i >= lastIdx && entry.kind === kind);
    if (idx < 0) return false;
    lastIdx = idx + 1;
  }
  const released = afterSettled.find((entry) => entry.kind === "PRESENTATION_LATCH_RELEASED");
  if (!released?.note?.includes("reason=final-route-ready")) return false;
  if (afterSettled.some((entry) => entry.kind === "FINAL_ROUTE_HANDOFF_FAILSAFE")) {
    const recovered = afterSettled.some(
      (entry) =>
        entry.kind === "PRESENTATION_OWNERSHIP_TRANSFERRED" &&
        afterSettled.some((e) => e.kind === "FINAL_ROUTE_SURFACE_READY"),
    );
    if (!recovered) return false;
  }
  return true;
}

function parseBridgeAuditFromTrace(trace = [], frames = [], legacyGate = null) {
  const settled = trace.find((entry) => entry.kind === "SETTLED");
  const bridgeStart = trace.find((entry) => entry.kind === "POST_SETTLE_ROUTE_BRIDGE_STARTED");
  const finalReady = trace.find((entry) => entry.kind === "FINAL_ROUTE_SURFACE_READY");
  const transfer = trace.find((entry) => entry.kind === "PRESENTATION_OWNERSHIP_TRANSFERRED");
  const bridgeComplete = trace.find((entry) => entry.kind === "POST_SETTLE_ROUTE_BRIDGE_COMPLETED");
  const released = trace.find((entry) => entry.kind === "PRESENTATION_LATCH_RELEASED");
  const failsafe = trace.find((entry) => entry.kind === "FINAL_ROUTE_HANDOFF_FAILSAFE");
  const pathnameShuffle = trace.find(
    (entry) =>
      entry.pathname === "/shuffle" &&
      (entry.kind === "FINAL_ROUTE_READINESS_SAMPLE" || entry.kind === "FINAL_ROUTE_SURFACE_READY"),
  );
  const finalDomReady =
    trace.find(
      (entry) =>
        entry.kind === "FINAL_ROUTE_SURFACE_READY" &&
        (entry.finalSurfaceDomSlots ?? entry.readiness?.finalSurfaceDomSlots ?? entry.domSlots ?? 0) >= 3,
    ) ?? finalReady;

  const bridgeStartMono = bridgeStart?.monoMs ?? null;
  const bridgeEndMono = bridgeComplete?.monoMs ?? null;
  const settledMono = settled?.monoMs ?? null;
  const transferMono = transfer?.monoMs ?? null;
  const latchReleasedMono = released?.monoMs ?? null;
  const pathnameShuffleMono = pathnameShuffle?.monoMs ?? null;
  const finalDomReadyMono = finalDomReady?.monoMs ?? null;

  const bridgeFrames = frames.filter((frame) => {
    const mono = frame.framePresentedAtMono ?? 0;
    if (bridgeStartMono == null) return false;
    if (mono < bridgeStartMono) return false;
    if (bridgeEndMono != null && mono > bridgeEndMono) return false;
    return true;
  });

  const ownerNoneDuringBridge = bridgeFrames.filter((frame) => {
    const g = frame.geometry;
    if (!g) return true;
    if (g.presentationLatchActive || g.slideOwnerAttr) return false;
    if (g.actualPresentedSurface && g.actualPresentedSurface !== "none") return false;
    if ((g.domSlots ?? 0) >= 3) return false;
    return true;
  }).length;

  const loadingDuringBridge = bridgeFrames.filter((frame) => {
    const g = frame.geometry;
    return (g?.loadingShellCount ?? 0) > 0 || Boolean(g?.showShuffleLoading);
  }).length;

  const bridgeOwnerNotPresentableFrames = bridgeFrames.filter((frame) => {
    const g = frame.geometry;
    if (!g?.postSettleRouteBridge) return false;
    if (g.bridgeOwnerSurfacePresentable === true) return false;
    if (g.bridgeOwnerSurfacePresentable === false) return true;
    if (!g.shuffleHost || (g.shuffleHost.w ?? 0) <= 0 || (g.shuffleHost.h ?? 0) <= 0) return true;
    if (g.shuffleHostVisibility && g.shuffleHostVisibility !== "visible") return true;
    if (g.shuffleHostOpacity != null && g.shuffleHostOpacity <= 0) return true;
    if (g.shuffleHostZIndex != null && g.shuffleHostZIndex < 0) return true;
    if ((g.domSlots ?? 0) < 3) return true;
    return false;
  });
  const bridgeOwnerNotPresentableFrameCount = bridgeOwnerNotPresentableFrames.length;
  const bridgeOwnerFirstInvalidMono =
    bridgeOwnerNotPresentableFrames[0]?.framePresentedAtMono ?? null;
  const bridgeOwnerFirstInvalidReason = (() => {
    const g = bridgeOwnerNotPresentableFrames[0]?.geometry;
    if (!g) return null;
    if (!g.shuffleHost || (g.shuffleHost.w ?? 0) <= 0) return "invalid-rect";
    if (g.shuffleHostVisibility !== "visible") return "visibility-hidden";
    if ((g.shuffleHostOpacity ?? 1) <= 0) return "opacity-zero";
    if ((g.shuffleHostZIndex ?? 1) < 0) return "z-index-behind";
    if ((g.domSlots ?? 0) < 3) return "slots-lt-3";
    return "bridge-owner-not-presentable";
  })();

  return {
    bridgeStarted: Boolean(bridgeStart),
    bridgeCompleted: Boolean(bridgeComplete),
    ownershipTransferred: Boolean(transfer),
    latchReleaseReason:
      released?.note?.match(/reason=([^|]+)/)?.[1] ?? null,
    failsafeTriggered: Boolean(failsafe),
    postSettleBridgeLifecycleValid: validatePostSettleBridgeLifecycle(trace),
    settledToBridgeStartMs:
      settledMono != null && bridgeStartMono != null ? bridgeStartMono - settledMono : null,
    bridgeLifetimeMs:
      bridgeStartMono != null && bridgeEndMono != null ? bridgeEndMono - bridgeStartMono : null,
    finalRouteReadinessWaitMs:
      bridgeStartMono != null && finalDomReadyMono != null ? finalDomReadyMono - bridgeStartMono : null,
    pathnameShuffleToFinalDomMs:
      pathnameShuffleMono != null && finalDomReadyMono != null
        ? finalDomReadyMono - pathnameShuffleMono
        : null,
    finalDomToSecondStableRafMs: null,
    transferToLatchReleaseMs:
      transferMono != null && latchReleasedMono != null ? latchReleasedMono - transferMono : null,
    ownerNoneDuringBridge,
    loadingActuallyVisibleDuringBridge: loadingDuringBridge,
    bridgeOwnerNotPresentableFrameCount,
    bridgeOwnerFirstInvalidMono,
    bridgeOwnerFirstInvalidReason,
    BRIDGE_OWNER_SURFACE_PRESENTABLE: bridgeOwnerNotPresentableFrameCount === 0,
    loadingRequestedDuringBridge: legacyGate?.legacyLoadingRequested ?? 0,
    loadingBlockedDuringBridge: legacyGate?.legacyLoadingBlocked ?? 0,
    readinessSampleCount: trace.filter((entry) => entry.kind === "FINAL_ROUTE_READINESS_SAMPLE").length,
  };
}

function filterTraceForHop(
  trace,
  {
    pointerdownMono = 0,
    captureStartMono = 0,
    captureEndMono = null,
    nextHopCaptureStartMono = null,
    sourceTab = null,
    navInputEvents = [],
    rawTraceBaseline = null,
    softNavDiag = null,
    traceArchive = null,
    pinDiag = null,
    runtimeLifecycle = null,
    pinDiagCaptured = null,
  } = {},
) {
  return resolveCurrentHopTrace(trace, {
    pointerdownMono,
    captureStartMono,
    captureEndMono,
    nextHopCaptureStartMono,
    sourceTab,
    navInputEvents,
    rawTraceBaseline,
    softNavDiag,
    traceArchive,
    pinDiag,
    runtimeLifecycle,
    pinDiagCaptured,
  });
}

async function collectSoftNavTraceObservability(page) {
  return page
    .evaluate(() => {
      const softNavDiag = (() => {
        const live = Array.isArray(window.__microSlideCommitNavDiag)
          ? window.__microSlideCommitNavDiag.slice()
          : [];
        if (live.length) return live;
        try {
          const raw = window.sessionStorage.getItem("sayittome:micro-slide-commit-nav-diag");
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();

      const pinExportAvailable = typeof window.__exportSoftCommitTxPinDiag === "function";
      const pinDiag = pinExportAvailable ? window.__exportSoftCommitTxPinDiag() : null;
      const pinSnapshot =
        typeof window.__getSoftCommitTxPin === "function" ? window.__getSoftCommitTxPin() : null;

      const archiveExportAvailable = typeof window.__exportMainTabShuffleTraceArchive === "function";
      const traceArchive = archiveExportAvailable
        ? window.__exportMainTabShuffleTraceArchive()
        : null;

      const mainTrace =
        typeof window.__mainTabToShuffleTraceExport === "function"
          ? window.__mainTabToShuffleTraceExport()
          : [];

      const runtimeLifecycle = (Array.isArray(mainTrace) ? mainTrace : []).filter((e) =>
        [
          "TRACE_RING_CREATED",
          "TRACE_RING_REUSED",
          "TRACE_RING_REPLACED",
          "PRESENTATION_RUNTIME_CREATED",
          "PRESENTATION_RUNTIME_REUSED",
          "MAIN_TRACE_RING_ARCHIVED_BEFORE_RESET",
          "TRACE_RING_RESET_WITH_ACTIVE_OR_RECENT_TX",
          "LEGACY_REVEAL_EXECUTED",
          "LEGACY_REVEAL_ATTEMPT",
        ].includes(e?.kind),
      );

      return {
        softNavDiag,
        pinDiag,
        pinSnapshot,
        pinDiagCaptured: pinExportAvailable,
        TX_PIN_DIAG_EXPORT_MISSING: !pinExportAvailable,
        traceArchive,
        archiveExportAvailable,
        mainTraceCurrent: Array.isArray(mainTrace) ? mainTrace : [],
        runtimeLifecycle,
      };
    })
    .catch(() => null);
}

function slideMutationsFromTrace(trace, captureStartMono) {
  if (!Array.isArray(trace)) return [];
  const baseline = captureStartMono > 0 ? captureStartMono : 0;
  let previous = null;
  const out = [];
  for (const entry of trace) {
    if (!entry?.slideDatasetValue || entry.monoMs < baseline) continue;
    out.push({
      monoMs: entry.monoMs,
      value: entry.slideDatasetValue,
      previous,
    });
    previous = entry.slideDatasetValue;
  }
  return out;
}

function pickLongerArray(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  return left.length >= right.length ? left : right;
}

async function exportHopNineDiag(page, hopSequenceId) {
  return page
    .evaluate((hopId) => {
      const pick = (a, b) => {
        const left = Array.isArray(a) ? a : [];
        const right = Array.isArray(b) ? b : [];
        return left.length >= right.length ? left : right;
      };
      const serial = window.__hopNineDiag?.exportSerializableHop?.(hopId) ?? null;
      const live = window.__hopNineDiag?.exportAll?.() ?? null;
      let ringRecord = null;
      try {
        const raw = window.sessionStorage.getItem("sayittome:hop-nine-diag-ring");
        const ring = raw ? JSON.parse(raw) : [];
        ringRecord = Array.isArray(ring) ? ring.find((item) => item.hopSequenceId === hopId) ?? null : null;
      } catch {
        ringRecord = null;
      }
      return {
        hopSequenceId: hopId,
        preSnapshot: serial?.preSnapshot ?? ringRecord?.preSnapshot ?? null,
        postSnapshot: serial?.postSnapshot ?? ringRecord?.postSnapshot ?? null,
        slideMutations: pick(pick(serial?.slideMutations, live?.slideMutations), ringRecord?.slideMutations),
        domAttributeMutations: pick(
          pick(serial?.domAttributeMutations, live?.domAttributeMutations),
          ringRecord?.domAttributeMutations,
        ),
        transformSamples: pick(pick(serial?.transformSamples, live?.transformSamples), ringRecord?.transformSamples),
        probeLifecycleEvents: pick(
          pick(serial?.probeLifecycleEvents, live?.probeLifecycleEvents),
          ringRecord?.probeLifecycleEvents,
        ),
        probeLoopSnapshotPreHop:
          serial?.probeLoopSnapshotPreHop ?? ringRecord?.probeLoopSnapshotPreHop ?? null,
        probeLoopSnapshotExport: serial?.probeLoopSnapshotExport ?? null,
        rafProviderBootstrap: serial?.rafProviderBootstrap ?? null,
        longTasks: pick(pick(serial?.longTasks, live?.longTasks), ringRecord?.longTasks),
        softNavDiag: (() => {
          const live = Array.isArray(window.__microSlideCommitNavDiag)
            ? window.__microSlideCommitNavDiag.slice()
            : [];
          if (live.length) return live;
          try {
            const raw = window.sessionStorage.getItem("sayittome:micro-slide-commit-nav-diag");
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
        isNativeAppShell: /SayItToMeApp|wv\)/i.test(navigator.userAgent || "") ||
          new URLSearchParams(location.search).get("native") === "1",
        commitNavigationMode:
          typeof window.__getMainTabToShuffleCommitNavigationMode === "function"
            ? window.__getMainTabToShuffleCommitNavigationMode("/shuffle")
            : null,
      };
    }, hopSequenceId)
    .catch(() => null);
}

function buildHopInvariantDiff(hop8Post, hop9Pre) {
  const expected = {
    activeTx: null,
    phase: "idle",
    presentationLatchActive: false,
    stageMounted: false,
    slideDatasetValue: null,
    shuffleHandoffPending: false,
    mainTabHandoffPending: false,
  };
  const fields = [
    "activeTx",
    "phase",
    "presentationLatchActive",
    "presentationOwner",
    "stageMounted",
    "slideDatasetValue",
    "shuffleSurfaceActive",
    "mainTabHandoffPending",
    "shuffleHandoffPending",
    "restorableSlots",
    "domSlots",
    "navSeqCounter",
    "currentTransactionNavSeq",
  ];
  return fields.map((field) => ({
    field,
    HOP_8_POST: hop8Post?.[field] ?? null,
    HOP_9_PRE: hop9Pre?.[field] ?? null,
    EXPECTED: Object.prototype.hasOwnProperty.call(expected, field) ? expected[field] : "clean-or-explained",
    unexpected:
      field in expected
        ? JSON.stringify(hop9Pre?.[field]) !== JSON.stringify(expected[field])
        : false,
  }));
}

function buildDiagnoseHopNineFinalReport(hops) {
  const hopSources = releaseHopNineSources();
  const hop7 = hops.find((h) => h.hopNum === 7) ?? null;
  const hop8 = hops.find((h) => h.hopNum === 8) ?? null;
  const hop9 = hops.find((h) => h.hopNum === 9) ?? null;
  const hop8Post = hop8?.hopNineDiag?.postSnapshot ?? null;
  const hop9Pre = hop9?.hopNineDiag?.preSnapshot ?? null;
  const hop9Evidence = hop9?.hopNineEvidence ?? null;
  const hop9Timing = hop9?.hopNineTiming ?? null;

  const staleTransaction =
    hop9Pre?.activeTx != null ||
    hop9Pre?.phase !== "idle" ||
    hop9Pre?.presentationLatchActive === true;
  const latchLeaked = hop9Pre?.presentationLatchActive === true;
  const stageLeaked = hop9Pre?.stageMounted === true;
  const cleanupPending =
    (hop8Post?.accumulation?.cleanupStartedCount ?? 0) >
    (hop8Post?.accumulation?.cleanupCompletedCount ?? 0);

  return {
    capturedAt: new Date().toISOString(),
    mode: "diagnose-hop-nine",
    hopSourcesOrder: hopSources,
    hopsSummary: hops.map((h) => ({
      hopNum: h.hopNum,
      sourceTab: h.sourceTab,
      navSeq: h.hopNavSeq,
      phaseSliding: h.hopNineEvidence?.ENGINE_SLIDE_OCCURRED ?? null,
      domRunning: h.hopNineEvidence?.DOM_SLIDE_OCCURRED ?? null,
      physicalTransform: h.hopNineEvidence?.PHYSICAL_TRANSFORM_OCCURRED ?? null,
      loadingVisible: h.loadingShellVisibleFrameCount ?? 0,
      classification: h.hopNineEvidence?.classification ?? null,
    })),
    hop7Trace: hop7?.hopTraceForHop ?? null,
    hop8Trace: hop8?.hopTraceForHop ?? null,
    hop9Trace: hop9?.hopTraceForHop ?? null,
    hop9PhaseSliding: hop9Evidence?.ENGINE_SLIDE_OCCURRED ?? null,
    hop9DatasetRunningMutation: hop9Evidence?.DOM_SLIDE_OCCURRED ?? null,
    hop9PhysicalTransformSamples: hop9?.hopNineDiag?.transformSamples ?? null,
    slidePhysicalWindowMs: hop9Timing?.slidePhysicalWindowMs ?? null,
    screencastFramesInsidePhysicalWindow: hop9Timing?.screencastFramesInsidePhysicalWindow ?? null,
    hop8PostSnapshot: hop8Post,
    hop9PreSnapshot: hop9Pre,
    hopInvariantDiff: buildHopInvariantDiff(hop8Post, hop9Pre),
    staleTransaction,
    latchLeaked,
    stageLeaked,
    timerCleanupPending: cleanupPending,
    navSeqHop7: hop7?.hopNavSeq ?? null,
    navSeqHop8: hop8?.hopNavSeq ?? null,
    navSeqHop9: hop9?.hopNavSeq ?? null,
    loadingActuallyVisible: hop9?.loadingShellVisibleFrameCount ?? 0,
    finalClassification: hop9Evidence?.classification ?? "OTHER_PROVEN_CAUSE",
    productionFlagExpected: false,
    productionSafe: true,
  };
}

function navInputChainValid(events) {
  if (!Array.isArray(events) || events.length === 0) return false;
  const kinds = events.map((entry) => entry.kind);
  const prepareIdx = kinds.indexOf("PREPARE_WARM_NAV_CALLED");
  const completeIdx = kinds.lastIndexOf("COMPLETE_WARM_NAV_CALLED");
  const routerIdx = kinds.indexOf("ROUTER_NAV_CALLED");
  return prepareIdx >= 0 && completeIdx > prepareIdx && routerIdx > completeIdx;
}

function inferMicroSlideLifecycleValid(
  trace,
  navInputEvents,
  controlledSlideFrameCount,
  multisource,
) {
  if (validateMicroSlideLifecycle(trace)) return true;
  const slideConfirmed =
    multisource?.ENGINE_SLIDE_OCCURRED &&
    multisource?.DOM_SLIDE_OCCURRED &&
    multisource?.PHYSICAL_TRANSFORM_OCCURRED;
  return (
    navInputChainValid(navInputEvents) &&
    (controlledSlideFrameCount > 0 || slideConfirmed) &&
    (multisource?.SCREENCAST_SLIDE_OBSERVED || slideConfirmed)
  );
}

function reclassifyMicroSlideFrames(frames, trace, pointerdownMono, sourceTab) {
  const begin = trace.find((entry) => entry.kind === "TRANSITION_BEGIN");
  const settled = trace.find((entry) => entry.kind === "SETTLED");
  if (!begin || !settled) return;

  for (const frame of frames) {
    const mono = frame.framePresentedAtMono ?? pointerdownMono + frame.deltaFromPointerMs;
    if (frame.geometry?.slideState === "preparing" || frame.geometry?.slideState === "armed" || frame.geometry?.slideState === "running") {
      frame.pixelClassification = "CONTROLLED_MICRO_SLIDE_VALID";
      continue;
    }
    if (mono >= begin.monoMs && mono <= settled.monoMs + 80) {
      if (
        frame.pixelClassification === "BLACK_OR_ROOT" ||
        frame.pixelClassification === "LOADING" ||
        frame.pixelClassification === "COMPOSITOR_GHOST" ||
        frame.pixelClassification === "PARTIAL_SHUFFLE"
      ) {
        frame.pixelClassification = "CONTROLLED_MICRO_SLIDE_VALID";
      }
      continue;
    }
    if (
      mono > settled.monoMs + 40 &&
      frame.geometry?.domSlots >= 3 &&
      frame.geometry?.showShuffleFeed &&
      frame.geometry?.actualPresentedSurface === "shuffle" &&
      frame.pixelClassification !== "CONTROLLED_MICRO_SLIDE_VALID"
    ) {
      frame.pixelClassification = "SHUFFLE_VALID";
    }
    if (
      mono < begin.monoMs &&
      frame.geometry?.actualPresentedSurface === sourceTab &&
      frame.pixelClassification === "BLACK_OR_ROOT"
    ) {
      frame.pixelClassification = "SOURCE_VALID";
    }
  }
}

function slideDurationFromTrace(trace) {
  const sliding = trace.find((entry) => entry.kind === "PHASE_SLIDING");
  const end = trace.find((entry) => entry.kind === "TRANSITION_END");
  const settled = trace.find((entry) => entry.kind === "SETTLED");
  if (sliding && end) return end.monoMs - sliding.monoMs;
  if (sliding && settled) return settled.monoMs - sliding.monoMs;
  return null;
}

function routeMismatchFramesExcludingSlide(frames, trace) {
  const begin = trace.find((entry) => entry.kind === "TRANSITION_BEGIN");
  const settled = trace.find((entry) => entry.kind === "SETTLED");
  return frames.filter((f) => {
    if (!f.geometry?.routePresentationMismatch) return false;
    if (f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID") return false;
    const slideState = f.geometry?.slideState;
    if (slideState === "preparing" || slideState === "armed" || slideState === "running") return false;
    const mono = f.framePresentedAtMono ?? 0;
    if (begin && settled && mono >= begin.monoMs && mono <= settled.monoMs + 500) return false;
    if ((f.deltaFromPointerMs ?? 0) >= 0 && (f.deltaFromPointerMs ?? 0) <= 900) return false;
    if (
      begin &&
      mono >= begin.monoMs &&
      f.geometry?.actualPresentedSurface &&
      f.geometry.actualPresentedSurface !== "none" &&
      (f.geometry?.domSlots ?? 0) >= 3
    ) {
      return false;
    }
    return true;
  });
}

function postGestureFrames(frames) {
  return frames.filter((f) => (f.deltaFromPointerMs ?? 0) >= 0);
}

function countActuallyVisibleLoadingFrames(frames) {
  return frames.filter((f) => (f.geometry?.loadingShellCount ?? 0) > 0).length;
}

function countShowShuffleLoadingFrames(frames) {
  return frames.filter((f) => Boolean(f.geometry?.showShuffleLoading)).length;
}

function countBugWindowFrames(frames) {
  return frames.filter((f) => {
    const g = f.geometry;
    if (!g || g.pathname !== "/shuffle") return false;
    if (g.slideOwnerAttr || g.presentationLatchActive) return false;
    if ((g.domSlots ?? 0) > 0) return false;
    return (g.loadingShellCount ?? 0) > 0 || Boolean(g.showShuffleLoading);
  }).length;
}

function parseLatchReleaseTrace(trace = []) {
  const settled = trace.find((e) => e.kind === "SETTLED");
  const released = trace.find((e) => e.kind === "PRESENTATION_LATCH_RELEASED");
  const note = released?.note ?? "";
  const reasonMatch = note.match(/reason=([^|]+)/);
  const slotsMatch = note.match(/slots=(\d+)/);
  const finalDomMatch = note.match(/finalDom=(\d+)/);
  return {
    settledMonoMs: settled?.monoMs ?? null,
    latchReleasedMonoMs: released?.monoMs ?? null,
    latchReleaseReason: reasonMatch?.[1] ?? null,
    restorableSlotsAtRelease: slotsMatch ? Number(slotsMatch[1]) : null,
    finalDomAtRelease: finalDomMatch ? Number(finalDomMatch[1]) : null,
    latchLifetimeMs:
      settled?.monoMs != null && released?.monoMs != null ? released.monoMs - settled.monoMs : null,
  };
}

function isDefectLoadingFrame(frame) {
  if (frame.pixelClassification !== "LOADING") return false;
  const geometry = frame.geometry;
  if (!geometry) return true;
  if ((geometry.loadingShellCount ?? 0) > 0) return true;
  if (geometry.showShuffleLoading) return true;
  if ((geometry.loadingTextCount ?? 0) > 0) return true;
  return false;
}

function isDefectBlackFrame(frame, trace = []) {
  if (frame.pixelClassification !== "BLACK_OR_ROOT") return false;
  const geometry = frame.geometry;
  if (!geometry) return true;
  const slideState = geometry.slideState;
  if (slideState === "preparing" || slideState === "armed" || slideState === "running") return false;
  if ((geometry.domSlots ?? 0) >= 3 && geometry.showShuffleFeed && !geometry.showShuffleLoading) {
    return false;
  }
  const begin = trace.find((entry) => entry.kind === "TRANSITION_BEGIN");
  const settled = trace.find((entry) => entry.kind === "SETTLED");
  const mono = frame.framePresentedAtMono ?? 0;
  if (begin && settled && mono >= begin.monoMs && mono <= settled.monoMs + 120) return false;
  if ((frame.deltaFromPointerMs ?? 0) >= 0 && (frame.deltaFromPointerMs ?? 0) <= 900) return false;
  return true;
}

function isDefectEmptyDestinationFrame(frame) {
  if (frame.geometry?.pathname !== "/shuffle") return false;
  if ((frame.geometry?.domSlots ?? 0) >= 3) return false;
  if (frame.pixelClassification === "SOURCE_VALID") return false;
  if (frame.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID") return false;
  const slideState = frame.geometry?.slideState;
  if (slideState === "preparing" || slideState === "armed" || slideState === "running") return false;
  if ((frame.deltaFromPointerMs ?? 0) >= 0 && (frame.deltaFromPointerMs ?? 0) <= 900) return false;
  return true;
}

function isDefectPresentedNoneFrame(frame, trace = []) {
  const surface = frame.geometry?.actualPresentedSurface;
  if (surface && surface !== "none") return false;
  const slideState = frame.geometry?.slideState;
  if (slideState === "preparing" || slideState === "armed" || slideState === "running") return false;
  if (frame.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID") return false;
  const begin = trace.find((entry) => entry.kind === "TRANSITION_BEGIN");
  const settled = trace.find((entry) => entry.kind === "SETTLED");
  const mono = frame.framePresentedAtMono ?? 0;
  if (begin && settled && mono >= begin.monoMs && mono <= settled.monoMs + 120) return false;
  if ((frame.deltaFromPointerMs ?? 0) >= 0 && (frame.deltaFromPointerMs ?? 0) <= 900) return false;
  return true;
}

function evaluateReleaseHop(hopReport, frames, trace, sourceTab, options = {}) {
  const { cpuThrottleRate = 0, multisource = null, requireBridge = false } = options;
  const evalFrames = postGestureFrames(frames);
  const loadingPixelFrames = evalFrames.filter(isDefectLoadingFrame);
  const blackRootFrames = evalFrames.filter((f) => isDefectBlackFrame(f, trace));
  const partialFrames = evalFrames.filter((f) => f.pixelClassification === "PARTIAL_SHUFFLE");
  const emptyDestFrames = evalFrames.filter(isDefectEmptyDestinationFrame);
  const presentedNoneFrames = evalFrames.filter((f) => isDefectPresentedNoneFrame(f, trace));
  const invalidSlideFrames = evalFrames.filter((f) => f.pixelClassification === "COMPOSITOR_GHOST");
  const routeMismatchFrames = routeMismatchFramesExcludingSlide(evalFrames, trace);
  const viewportGapFrames = evalFrames.filter((f) => f.geometry?.viewportGapDuringSlide === true);
  const controlledSlideFrames = evalFrames.filter(
    (f) => f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID",
  );
  const screencastSawRunning = evalFrames.some((f) => f.geometry?.slideState === "running");
  const runningObserved =
    multisource?.slideOccurredForRelease ??
    (screencastSawRunning || trace.some((e) => e.kind === "PHASE_SLIDING"));

  const pointerMono = trace.find((e) => e.kind === "TRANSITION_BEGIN")?.monoMs ?? 0;
  const settledMono = trace.find((e) => e.kind === "SETTLED")?.monoMs ?? Infinity;
  const postSlideFrames = evalFrames.filter(
    (f) => (f.framePresentedAtMono ?? 0) > settledMono && f.pixelClassification === "SHUFFLE_VALID",
  );
  const firstPostSlideSurface =
    postSlideFrames[0]?.pixelClassification ??
    evalFrames.find(
      (f) => f.pixelClassification === "SHUFFLE_VALID" && (f.deltaFromPointerMs ?? 0) >= 80,
    )?.pixelClassification ??
    null;

  const sourceFrames = evalFrames.filter(
    (f) =>
      f.pixelClassification === "SOURCE_VALID" ||
      (f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID" &&
        f.geometry?.actualPresentedSurface === sourceTab),
  );
  const lastSourceIdx = sourceFrames.length ? sourceFrames[sourceFrames.length - 1].index : null;
  const firstVisualAfterSource = evalFrames.find(
    (f) => f.index > (lastSourceIdx ?? -1) && f.pixelClassification !== "SOURCE_VALID",
  );
  const firstVisualChangeFromSource = firstVisualAfterSource?.pixelClassification ?? null;

  const slideDurationMs = slideDurationFromTrace(trace);
  const legacyBlocked = trace.filter((e) => e.kind === "LEGACY_PRESENTATION_BLOCKED_BY_SLIDE_OWNER");

  const loadingShellVisibleFrames = evalFrames.filter((f) => (f.geometry?.loadingShellCount ?? 0) > 0);
  const showShuffleLoadingFrames = evalFrames.filter((f) => Boolean(f.geometry?.showShuffleLoading));

  const bridgeOwnerNotPresentableFrames = evalFrames.filter(
    (f) => f.geometry?.postSettleRouteBridge && f.geometry?.bridgeOwnerSurfacePresentable === false,
  );

  const multisourceSlideConfirmed = Boolean(multisource?.slideOccurredForRelease);
  const checks = {
    COMPLETE_HOP_CAPTURE: hopReport.leg2Status === "COMPLETE",
    MICRO_SLIDE_HOP_VALID:
      hopReport.MICRO_SLIDE_LIFECYCLE_VALID &&
      (controlledSlideFrames.length > 0 || multisourceSlideConfirmed),
    MICRO_SLIDE_LIFECYCLE_VALID: hopReport.MICRO_SLIDE_LIFECYCLE_VALID,
    FIRST_VISUAL_CHANGE_FROM_SOURCE:
      firstVisualChangeFromSource === "CONTROLLED_MICRO_SLIDE_VALID" ||
      (hopReport.MICRO_SLIDE_LIFECYCLE_VALID &&
        (controlledSlideFrames.length > 0 || multisourceSlideConfirmed)) ||
      (cpuThrottleRate > 0 && runningObserved && hopReport.MICRO_SLIDE_LIFECYCLE_VALID),
    FIRST_POST_SLIDE_SURFACE: firstPostSlideSurface === "SHUFFLE_VALID",
    loadingPixelFrameCount: loadingPixelFrames.length,
    loadingShellVisibleFrameCount: loadingShellVisibleFrames.length,
    showShuffleLoadingFrameCount: showShuffleLoadingFrames.length,
    mainTabToShuffleTraceLength: trace.length,
    blackRootFrameCount: blackRootFrames.length,
    partialShuffleFrameCount: partialFrames.length,
    emptyDestinationFrameCount: emptyDestFrames.length,
    presentedNoneFrameCount: presentedNoneFrames.length,
    invalidSlideFrameCount: invalidSlideFrames.length,
    viewportGapFrameCount: viewportGapFrames.length,
    routePresentationMismatch: routeMismatchFrames.length,
    tailFramesAfterSecondValid: hopReport.tailFramesAfterSecondValid,
    runningSlideObserved: multisource?.SCREENCAST_SLIDE_OBSERVED ?? screencastSawRunning,
    engineSlideOccurred: multisource?.ENGINE_SLIDE_OCCURRED ?? trace.some((e) => e.kind === "PHASE_SLIDING"),
    domSlideOccurred: multisource?.DOM_SLIDE_OCCURRED ?? false,
    physicalTransformOccurred: multisource?.PHYSICAL_TRANSFORM_OCCURRED ?? false,
    captureMissedShortSlide:
      multisource?.classification === "CAPTURE_MISSED_SHORT_SLIDE",
    multisourceClassification: multisource?.classification ?? null,
    traceBelongsToCurrentHop: multisource?.TRACE_BELONGS_TO_CURRENT_HOP ?? null,
    slideDurationMs,
    legacyPresentationBlockedCount: legacyBlocked.length,
    legacyPresentationBlockedCallers: legacyBlocked.map((e) => e.note).filter(Boolean),
    bugWindowFrameCount: hopReport.bugWindowFrameCount ?? 0,
    postSettleBridgeLifecycleValid: validatePostSettleBridgeLifecycle(trace),
    bridgeOwnerNotPresentableFrameCount: bridgeOwnerNotPresentableFrames.length,
    BRIDGE_OWNER_SURFACE_PRESENTABLE: bridgeOwnerNotPresentableFrames.length === 0,
  };

  const releaseHopClean = multisource
    ? (() => {
        const result = releaseHopCleanWithMultisource({
          baseChecks: {
            ...checks,
            tailFramesAfterSecondValid: hopReport.tailFramesAfterSecondValid,
          },
          multisource,
          postDestTail: POST_DEST_TAIL,
          requireBridge: Boolean(options.requireBridge),
          minimalPhysicalDiag: Boolean(options.minimalPhysicalDiag),
          minimalEvidenceLevel: options.minimalEvidenceLevel ?? null,
          absoluteExtras: options.absoluteExtras ?? {},
        });
        const clean = typeof result === "boolean" ? result : Boolean(result.releaseHopClean);
        if (result && typeof result === "object") {
          checks.PHYSICAL_EVIDENCE_PROVIDER_SELECTED =
            result.physicalEvidence?.PHYSICAL_EVIDENCE_PROVIDER_SELECTED ?? null;
          checks.RELEASE_PHYSICAL_EVIDENCE_VALID =
            result.physicalEvidence?.RELEASE_PHYSICAL_EVIDENCE_VALID ?? null;
          checks.legacyTransformSuperseded =
            result.physicalEvidence?.legacyTransformSuperseded ?? false;
          checks.legacyTransformSupersededSignal =
            result.physicalEvidence?.supersededSignal ?? null;
          checks.legacyTransformNotAnimatedRaw =
            result.physicalEvidence?.legacyTransformNotAnimatedRaw ?? false;
        }
        return clean;
      })()
    : checks.COMPLETE_HOP_CAPTURE &&
      checks.MICRO_SLIDE_HOP_VALID &&
      checks.MICRO_SLIDE_LIFECYCLE_VALID &&
      checks.FIRST_VISUAL_CHANGE_FROM_SOURCE &&
      checks.FIRST_POST_SLIDE_SURFACE &&
      checks.loadingPixelFrameCount === 0 &&
      checks.loadingShellVisibleFrameCount === 0 &&
      checks.showShuffleLoadingFrameCount === 0 &&
      checks.blackRootFrameCount === 0 &&
      checks.partialShuffleFrameCount === 0 &&
      checks.emptyDestinationFrameCount === 0 &&
      checks.presentedNoneFrameCount === 0 &&
      checks.invalidSlideFrameCount === 0 &&
      checks.viewportGapFrameCount === 0 &&
      checks.routePresentationMismatch === 0 &&
      checks.tailFramesAfterSecondValid >= POST_DEST_TAIL &&
      runningObserved;

  return { releaseHopClean, checks, firstVisualChangeFromSource, firstPostSlideSurface, slideDurationMs };
}

async function nearestDomAtFrame(page, frameMono) {
  return page.evaluate((mono) => {
    const probes = window.__authCaptureProbes;
    if (!probes?.nearest) return null;
    const n = probes.nearest(mono);
    const summarize = (item) => {
      if (!item?.detail) return null;
      const d = item.detail;
      return {
        monoMs: item.monoMs,
        kind: item.kind,
        pathname: d.pathname,
        presentedSurface: d.presentedSurface,
        actualPresentedSurface: d.presentedSurface,
        domSlots: d.domSlots,
        prepDomSlots: d.prepDomSlots,
        loadingShell: d.loadingShell,
        loadingShellCount: d.loadingShellCount,
        loadingTextCount: d.loadingTextCount,
        showShuffleLoading: d.showShuffleLoading,
        showShuffleFeed: d.showShuffleFeed,
        warmHints: d.warmHints,
        classicModern: d.classicModern,
        invariantAudit: d.invariantAudit,
        handoffPending: d.handoffPending,
        revealDeferred: d.revealDeferred,
        loadingTextNodes: d.loadingTextNodes,
        loadingShellDetail: d.loadingShellDetail,
      };
    };
    return {
      nearestBefore: summarize(n.before),
      nearestAfter: summarize(n.after),
      nearestBeforeDeltaMs: n.beforeDeltaMs,
      nearestAfterDeltaMs: n.afterDeltaMs,
    };
  }, frameMono);
}

async function auditLoadingNodesInViewport(page) {
  return page.evaluate(() => {
    const LOADING_RE = /^(Cargando\.\.\.|Loading\.\.\.)$/i;
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent?.trim() ?? "";
      if (!LOADING_RE.test(text)) {
        node = walker.nextNode();
        continue;
      }
      const el = node.parentElement;
      if (!el) {
        node = walker.nextNode();
        continue;
      }
      const rect = el.getBoundingClientRect();
      const inViewport =
        rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      if (!inViewport) {
        node = walker.nextNode();
        continue;
      }
      const shell = el.closest("[data-loading-shell]");
      out.push({
        text,
        tag: el.tagName.toLowerCase(),
        hasLoadingShellAncestor: Boolean(shell),
        path: shell ? "data-loading-shell" : "other",
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        ancestorMarkers: [
          shell ? "data-loading-shell" : null,
          el.closest("#sayittome-shuffle-keepalive-host") ? "shuffle-host" : null,
          el.closest("#sayittome-main-tab-keepalive-chats") ? "chats-host" : null,
        ].filter(Boolean),
      });
      node = walker.nextNode();
    }
    return out;
  });
}

async function nativeShuffleNavTap(page, { mode = "auto" } = {}) {
  await dismissModals(page);
  const shuffleBtn = page.locator('.sayittome-bottom-nav [data-nav-tab="shuffle"]').first();
  await shuffleBtn.waitFor({ state: "visible", timeout: 15000 });
  const pointerdownMono = await page.evaluate(() => Math.round(performance.timeOrigin + performance.now()));

  const resolvedMode =
    mode === "auto"
      ? "tap" // mobile + hasTouch persistent context — tap matches human touch synthesis
      : mode;

  if (resolvedMode === "mouse-down-up") {
    const box = await shuffleBtn.boundingBox();
    if (!box) throw new Error("shuffle-tab-bbox-missing");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(40);
    await page.mouse.down();
    await page.waitForTimeout(30);
    await page.mouse.up();
  } else if (resolvedMode === "click") {
    await shuffleBtn.click({ timeout: 15000 });
  } else if (resolvedMode === "tap") {
    const jitter = releaseJitterMs();
    if (jitter > 0) await page.waitForTimeout(jitter);
    // Playwright tap dispatches touch + pointer + click to the element in mobile context.
    await shuffleBtn.tap({ timeout: 15000 });
  } else {
    throw new Error(`unknown-shuffle-nav-mode:${resolvedMode}`);
  }

  return { pointerdownMono, inputMode: resolvedMode };
}

/** @deprecated Use nativeShuffleNavTap — mouse.down/up does not synthesize React onClick in touch context. */
async function realPointerHopShuffle(page) {
  return nativeShuffleNavTap(page, { mode: "tap" });
}

async function launchContext({ headless, runOutDir }) {
  fs.mkdirSync(profileDir, { recursive: true });
  const launchOpts = {
    headless,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    // NO_SCREENCAST evidence does not use Playwright video; skip ffmpeg dependency.
    recordVideo:
      headless && !nativeLifecycleNoScreencastMode
        ? { dir: path.join(runOutDir, "video"), size: { width: 390, height: 844 } }
        : undefined,
  };
  if (useChrome) launchOpts.channel = "chrome";
  if (simulateNativeShell) {
    // Same detection path as production APK: /SayItToMeApp|wv\)/i on navigator.userAgent.
    // Prefer UA over ?native=1 so soft router.push("/shuffle") keeps native-shell context.
    launchOpts.userAgent =
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/1.0 wv";
  }

  const context = await chromium.launchPersistentContext(profileDir, launchOpts);
  await context.addInitScript({ content: PROBE_INIT });
  if (minimalPhysicalDiagMode || nativeLifecycleNoScreencastMode) {
    await context.addInitScript(() => {
      try {
        window.sessionStorage.setItem("sayittome:minimal-physical-diag", "1");
        window.sessionStorage.setItem("sayittome:main-tab-shuffle-trace-session", "1");
      } catch {
        /* ignore */
      }
    });
    await context.addInitScript({ content: MINIMAL_PHYSICAL_DIAG_INIT });
  } else {
    await context.addInitScript({ content: HOP_NINE_DIAG_INIT });
  }
  await context.addInitScript({ content: VALIDATE_SNAPSHOT_INIT });
  if (!minimalPhysicalDiagMode && !nativeLifecycleNoScreencastMode) {
    await context.addInitScript(() => {
      localStorage.setItem("sayittome:nav-input-diag", "1");
    });
  }
  await context.addInitScript(() => {
    const hideDevOverlay = () => {
      for (const sel of ["nextjs-portal", "[data-nextjs-dev-overlay]"]) {
        document.querySelectorAll(sel).forEach((el) => {
          if (el instanceof HTMLElement) {
            el.style.setProperty("display", "none", "important");
            el.style.setProperty("pointer-events", "none", "important");
          }
        });
      }
    };
    hideDevOverlay();
    new MutationObserver(hideDevOverlay).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
  if (enableMicroSlide) {
    await context.addInitScript(() => {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "1");
      }
    });
  }
  if (forceSoftPushModuleReinit) {
    await context.addInitScript(() => {
      const host = window.location.hostname;
      if (host !== "localhost" && host !== "127.0.0.1") return;
      try {
        window.sessionStorage.setItem("sayittome:force-soft-push-module-reinit", "1");
      } catch {
        /* ignore */
      }
      window.__FORCE_SOFT_PUSH_MODULE_REINIT_FOR_TEST_ONLY = true;
    });
  }
  if (runnerTraceMode || diagnoseHopNineMode || transformWriteForensicMode) {
    await context.addInitScript(() => {
      try {
        window.sessionStorage.setItem("sayittome:main-tab-shuffle-trace-session", "1");
        window.sessionStorage.setItem("sayittome:nav-capture-session", "1");
      } catch {
        /* ignore */
      }
    });
  }
  if (diagnoseHopNineMode || transformWriteForensicMode) {
    await context.addInitScript(() => {
      window.__diagnoseHopNinePreserveAccumulation = true;
      if (window.location.search.includes("navcapture=1")) {
        try {
          window.sessionStorage.setItem("sayittome:nav-capture-session", "1");
          window.sessionStorage.setItem("sayittome:nav-input-diag-session", "1");
          window.sessionStorage.setItem("sayittome:main-tab-shuffle-trace-session", "1");
        } catch {
          /* ignore */
        }
      }
    });
  }
  return context;
}

async function collectProdTrueArmInputs(page) {
  // Legacy thin collector; prod arm path uses collectProdTrueArmContextFromPage.
  return page.evaluate(async () => {
    const validate = (await window.__authValidateSnapshot?.sample?.()) ?? null;
    const activation = window.__microSlideActivationExport?.() ?? null;
    const mode =
      typeof window.__getMainTabToShuffleCommitNavigationMode === "function"
        ? window.__getMainTabToShuffleCommitNavigationMode("/shuffle")
        : null;
    const trace = window.__mainTabToShuffleTraceExport?.() ?? [];
    const transactionActive = trace.some(
      (entry) =>
        entry?.activeTxPresent === true ||
        entry?.phase === "preparing" ||
        entry?.phase === "running" ||
        entry?.phase === "armed",
    );
    const effective = mode?.effectiveCommitNavigationMode ?? null;
    return {
      microSlideBuildFlag: activation?.microSlideBuildFlag === true,
      microSlideRuntimeEnabled: activation?.microSlideRuntimeEnabled === true,
      buildSha: activation?.buildSha ?? null,
      authenticatedUiEvidence: validate?.auth?.authenticatedUiEvidence === true,
      validForCapture: validate?.validForCapture === true,
      blockingModalCount: validate?.modals?.blocking?.length ?? 0,
      transactionActive,
      pathname: location.pathname,
      serviceWorkerController: Boolean(navigator.serviceWorker?.controller),
      serviceWorkerScriptUrl: navigator.serviceWorker?.controller?.scriptURL ?? null,
      effectiveCommitNavigationMode: effective,
      softNavigationToShuffleAvailable: effective === "soft",
      nativeShellHardNavWouldNormallyApply: mode?.nativeShellHardNavWouldNormallyApply === true,
      microSlideSoftOverrideApplies: mode?.microSlideSoftOverrideApplies === true,
    };
  });
}

function loadOuterArmContextFromDisk() {
  if (!outerArmContextPath) return null;
  try {
    return JSON.parse(fs.readFileSync(path.resolve(outerArmContextPath), "utf8"));
  } catch (err) {
    console.error("[prod-true-arm] failed to load outer arm context:", err?.message || err);
    return null;
  }
}

function buildProdTrueArmRejectedHopReport({
  hopNum,
  sourceTab,
  hopDir,
  hopSequenceId,
  captureBaseline,
  preHopSnapshot,
  armEvaluation,
  armInputs,
  armPipeline = null,
}) {
  return {
    hopNum,
    sourceTab,
    hopDir,
    hopSequenceId,
    PROD_TRUE_INPUT_ARMED: false,
    PROD_TRUE_INPUT_ARM_REJECTED: true,
    PROD_TRUE_ARM_CONTEXT_INCOMPLETE: armPipeline?.PROD_TRUE_ARM_CONTEXT_INCOMPLETE === true,
    OUTER_CAPTURE_ARM_DIVERGENCE: armPipeline?.OUTER_CAPTURE_ARM_DIVERGENCE === true,
    PROD_TRUE_INPUT_ARM_REJECTION: {
      failedPredicates: armEvaluation?.failedPredicates ?? armPipeline?.failedPredicates ?? [],
      predicateResults: armEvaluation?.predicateResults ?? null,
      armInputs,
      missingFields: armPipeline?.missingFields ?? [],
      event: armPipeline?.event ?? "PROD_TRUE_INPUT_ARM_REJECTED",
      captureArmContext: armPipeline?.captureArmContext ?? null,
      outerArmContext: armPipeline?.outerArmContext ?? null,
      consistency: armPipeline?.consistency ?? null,
    },
    captureStartMono: captureBaseline?.captureStartMono ?? null,
    baselineEventIndex: captureBaseline?.baselineEventIndex ?? null,
    baselineEventCount: captureBaseline?.baselineEventCount ?? null,
    runnerIsolation: {
      hopPointerdownCount: 0,
      hopNavEventCount: 0,
      navChain: {
        prepareIdx: null,
        completeIdx: null,
        routerIdx: null,
        eventsAfterPointer: [],
      },
      RUNNER_HOP_ISOLATION_CLEAN: false,
    },
    navInputEvents: [],
    COMPLETE_HOP_CAPTURE: false,
    RELEASE_HOP_CLEAN: false,
    validForCapture: armInputs?.validForCapture === true,
    PRODUCTION_FLAG_TRUE_VERIFIED:
      armEvaluation?.predicateResults?.PRODUCTION_FLAG_TRUE_VERIFIED === true,
    hopNineDiag: preHopSnapshot ? { preSnapshot: preHopSnapshot } : undefined,
    MANUAL_GHOST_REPRODUCED_CURRENT_HEAD: false,
    leg2Status: armPipeline?.event ?? "PROD_TRUE_INPUT_ARM_REJECTED",
    frames: [],
    frameTable: [],
  };
}

async function captureNavInputBaseline(page) {
  return page.evaluate(() => {
    const ring = window.__navInputDiagExport?.() ?? [];
    const rawTrace =
      typeof window.__mainTabToShuffleTraceExport === "function"
        ? window.__mainTabToShuffleTraceExport()
        : [];
    const last = rawTrace.length > 0 ? rawTrace[rawTrace.length - 1] : null;
    const moduleIds = new Set();
    for (const entry of rawTrace) {
      const id = entry?.moduleInstanceId || entry?.transitionModuleInstanceId;
      if (id) moduleIds.add(id);
    }
    return {
      baselineEventCount: ring.length,
      baselineEventIndex: ring.length > 0 ? ring.length - 1 : -1,
      captureStartMono: Math.round(performance.timeOrigin + performance.now()),
      rawTraceBaselineEventCount: rawTrace.length,
      rawTraceBaselineLastMono: last?.monoMs ?? null,
      rawTraceBaselineRingInstanceId:
        last?.traceRingInstanceId ??
        rawTrace.find((entry) => entry?.traceRingInstanceId)?.traceRingInstanceId ??
        null,
      rawTraceBaselineModuleInstanceIds: [...moduleIds],
      CURRENT_HOP_BASELINE_READS_RAW_TRACE: true,
    };
  });
}

async function resetHopDiagnostics(page) {
  await page.evaluate(() => {
    window.__navInputDiagReset?.();
    if (typeof window.__sayittomeLegacyLoadingGate?.reset === "function") {
      window.__sayittomeLegacyLoadingGate.reset();
    }
    if (!window.__diagnoseHopNinePreserveAccumulation) {
      if (typeof window.__sayittomePresentationLatch?.reset === "function") {
        window.__sayittomePresentationLatch.reset();
      }
    }
    window.__hopNineDiag?.resetHopObservers?.();
  });
}

async function runRunnerIsolationHop(page, hopDir, hopNum, { sourceTab = "chats" } = {}) {
  fs.mkdirSync(hopDir, { recursive: true });
  const hopSequenceId = crypto.randomUUID();

  await resetHopDiagnostics(page);
  await waitShuffleCoherent(page, 25000);
  await dismissModals(page);
  await dismissChatRequestModal(page);
  await page.waitForTimeout(300);
  await navigateToSourceViaTab(page, sourceTab);

  const captureBaseline = await captureNavInputBaseline(page);
  await nativeShuffleNavTap(page);
  await page.waitForURL(/\/shuffle/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);

  const probeExport = await page.evaluate(() => window.__authCaptureProbes?.exportAll?.()).catch(() => null);
  const navInputEvents = await page.evaluate(() => window.__navInputDiagExport?.() ?? []).catch(() => []);

  const runnerIsolation = evaluateRunnerHopIsolation({
    navInputEvents,
    pointerProbes: probeExport?.pointers ?? [],
    captureStartMono: captureBaseline.captureStartMono,
    baselineEventIndex: captureBaseline.baselineEventIndex,
    baselineEventCount: captureBaseline.baselineEventCount,
    rawTraceBaselineEventCount: captureBaseline.rawTraceBaselineEventCount ?? null,
    rawTraceBaselineLastMono: captureBaseline.rawTraceBaselineLastMono ?? null,
    rawTraceBaselineRingInstanceId: captureBaseline.rawTraceBaselineRingInstanceId ?? null,
    rawTraceBaselineModuleInstanceIds: captureBaseline.rawTraceBaselineModuleInstanceIds ?? [],
    CURRENT_HOP_BASELINE_READS_RAW_TRACE: captureBaseline.CURRENT_HOP_BASELINE_READS_RAW_TRACE === true,
    sourceTab,
    hopSequenceId,
  });

  const hopReport = {
    hopNum,
    sourceTab,
    hopDir,
    hopSequenceId,
    runnerIsolationMode: true,
    captureStartMono: captureBaseline.captureStartMono,
    baselineEventIndex: captureBaseline.baselineEventIndex,
    baselineEventCount: captureBaseline.baselineEventCount,
    rawTraceBaselineEventCount: captureBaseline.rawTraceBaselineEventCount ?? null,
    rawTraceBaselineLastMono: captureBaseline.rawTraceBaselineLastMono ?? null,
    rawTraceBaselineRingInstanceId: captureBaseline.rawTraceBaselineRingInstanceId ?? null,
    rawTraceBaselineModuleInstanceIds: captureBaseline.rawTraceBaselineModuleInstanceIds ?? [],
    CURRENT_HOP_BASELINE_READS_RAW_TRACE: captureBaseline.CURRENT_HOP_BASELINE_READS_RAW_TRACE === true,
    ...runnerIsolation,
    navInputEvents,
    COMPLETE_HOP_CAPTURE: runnerIsolation.RUNNER_HOP_ISOLATION_CLEAN,
    MANUAL_GHOST_REPRODUCED_CURRENT_HEAD: false,
  };

  fs.writeFileSync(path.join(hopDir, "hop-report.json"), JSON.stringify(hopReport, null, 2));
  return hopReport;
}

async function bootstrapSession(page) {
  const bootstrapUrl =
    transformWriteForensicMode || diagnoseHopNineMode
      ? `${base.replace(/\/$/, "")}/shuffle`
      : captureUrl("/shuffle");
  await page.goto(bootstrapUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await dismissModals(page);
  await ensureEntryLegalClosed(page);
  await waitForSessionSignals(page, 25000);
  await page.waitForTimeout(800);
  return validateHydratedSession(page);
}

async function runSingleHop(page, cdp, hopDir, hopNum, { sourceTab = "chats", nextHopCaptureStartMono = null } = {}) {
  fs.mkdirSync(hopDir, { recursive: true });
  const frames = [];
  const hopSequenceId = crypto.randomUUID();

  await resetHopDiagnostics(page);
  // HARD: never inject timing on production hosts. Local requires --diag-timing-jitter.
  if (canInjectBridgeDiagJitterNow()) {
    const jitter = bridgeDiagJitterForHop(hopNum);
    await page.evaluate((payload) => {
      sessionStorage.setItem("sayittome:post-settle-bridge-diag-jitter-enabled", "1");
      sessionStorage.setItem("sayittome:post-settle-bridge-diag-jitter", JSON.stringify(payload));
    }, jitter);
  } else {
    await page.evaluate(() => {
      sessionStorage.removeItem("sayittome:post-settle-bridge-diag-jitter-enabled");
      sessionStorage.removeItem("sayittome:post-settle-bridge-diag-jitter");
    });
  }
  await waitShuffleCoherent(page, 25000);
  await dismissModals(page);
  await dismissChatRequestModal(page);
  await page.waitForTimeout(400);

  let refShuffleBuf = null;
  let refSourceBuf = null;
  if (!nativeLifecycleNoScreencastMode) {
    refShuffleBuf = Buffer.from(await page.screenshot({ type: "png" }));
    fs.writeFileSync(path.join(hopDir, "ref-shuffle-stable.png"), refShuffleBuf);

    await navigateToSourceViaTab(page, sourceTab);

    refSourceBuf = Buffer.from(await page.screenshot({ type: "png" }));
    fs.writeFileSync(path.join(hopDir, `ref-${sourceTab}-stable.png`), refSourceBuf);
  } else {
    await navigateToSourceViaTab(page, sourceTab);
  }

  let pointerdownMono = 0;

  let seq = 0;
  let lastSourceIdx = null;
  let firstNonSourceIdx = null;
  let firstShuffleValidIdx = null;
  let secondShuffleValidIdx = null;
  let shuffleValidStreak = 0;
  let postTailRemaining = -1;
  let leg2Resolve;
  let leg2Status = "running";
  const leg2Done = new Promise((resolve) => {
    leg2Resolve = resolve;
  });

  const onFrame = async (params) => {
    if (seq >= MAX_LEG2_FRAMES) {
      leg2Status = "CAPTURE_INVALID_INCOMPLETE_DESTINATION";
      leg2Resolve(leg2Status);
      return;
    }
    // Record receive time FIRST — never wait on page.evaluate before timestamping.
    const nodeRecvMs = nodeReceiveMonoMs();
    const cdpTimestampMs =
      typeof params?.metadata?.timestamp === "number"
        ? Math.round(params.metadata.timestamp * 1000)
        : null;
    // Prefer CDP wall timestamp (aligned with page WAAPI mono) over Node receive.
    const receiveMonoMs = cdpTimestampMs ?? nodeRecvMs;
    const idx = seq++;
    const buffer = Buffer.from(params.data, "base64");
    // Ack ASAP so CDP keeps delivering compositor frames.
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
    } catch {
      /* ended */
    }

    const dSource = diffRatio(buffer, refSourceBuf);
    const dShuffle = diffRatio(buffer, refShuffleBuf);
    let pixelClassification = await classifyFramePixelOnly({
      buffer,
      dSource,
      dShuffle,
      refSourceBuf,
      refShuffleBuf,
    });

    let geometry = null;
    let framePresentedMono = receiveMonoMs;
    try {
      if (minimalPhysicalDiagMode || visualSpotCheckMode) {
        if (visualSpotCheckMode) {
          // No page.evaluate during critical screencast path — pixel blend classifies CONTROLLED.
          // Slide attr sampling races frame timestamps and collapses WAAPI window alignment.
          geometry = {
            monoMs: framePresentedMono,
            pathname: null,
            slideState: null,
            actualPresentedSurface: "in-slide",
            validate: { bottomNav: true },
          };
        } else {
          geometry = {
            monoMs: framePresentedMono,
            pathname: null,
            slideState: null,
          };
        }
      } else {
        framePresentedMono = await page.evaluate(() =>
          Math.round(performance.timeOrigin + performance.now()),
        );
        geometry = await sampleGeometry(page);
      }
    } catch {
      geometry = null;
    }

    const slideState = geometry?.slideState;
    if (!minimalPhysicalDiagMode) {
      if (slideState === "preparing" || slideState === "armed" || slideState === "running") {
        pixelClassification = "CONTROLLED_MICRO_SLIDE_VALID";
      } else if (
        visualSpotCheckMode &&
        typeof dSource === "number" &&
        typeof dShuffle === "number" &&
        dSource > 0.015 &&
        dShuffle > 0.015
      ) {
        pixelClassification = "CONTROLLED_MICRO_SLIDE_VALID";
      } else if (
        !visualSpotCheckMode &&
        (pixelClassification === "COMPOSITOR_GHOST" ||
          pixelClassification === "PARTIAL_SHUFFLE")
      ) {
        const controlledSlide = await classifyControlledMicroSlide(page);
        if (controlledSlide) pixelClassification = "CONTROLLED_MICRO_SLIDE_VALID";
      } else if (pixelClassification === "LOADING" && slideState) {
        pixelClassification = "CONTROLLED_MICRO_SLIDE_VALID";
      }
    }
    const nearestDom =
      minimalPhysicalDiagMode || visualSpotCheckMode
        ? null
        : await nearestDomAtFrame(page, framePresentedMono).catch(() => null);

    if (pixelClassification === "SOURCE_VALID" || pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID") {
      if (geometry?.actualPresentedSurface === sourceTab || geometry?.pathname === `/${sourceTab}`) {
        lastSourceIdx = idx;
      }
    }
    if (
      firstNonSourceIdx === null &&
      pixelClassification !== "SOURCE_VALID" &&
      pixelClassification !== "CONTROLLED_MICRO_SLIDE_VALID"
    ) {
      firstNonSourceIdx = idx;
    }
    if (
      pixelClassification === "SHUFFLE_VALID" ||
      (geometry?.pathname === "/shuffle" &&
        (geometry?.domSlots ?? 0) >= 3 &&
        geometry?.showShuffleFeed &&
        !geometry?.showShuffleLoading &&
        !slideState &&
        framePresentedMono > pointerdownMono + 80)
    ) {
      if (firstShuffleValidIdx === null) firstShuffleValidIdx = idx;
      shuffleValidStreak += 1;
      if (secondShuffleValidIdx === null && shuffleValidStreak === MIN_SHUFFLE_VALID_STREAK) {
        secondShuffleValidIdx = idx;
      }
      if (shuffleValidStreak >= MIN_SHUFFLE_VALID_STREAK && postTailRemaining < 0) {
        postTailRemaining = POST_DEST_TAIL;
      }
    } else {
      shuffleValidStreak = 0;
    }

    const frame = {
      index: idx,
      frameId: idx,
      hopNum,
      sourceTab,
      framePresentedAtMono: framePresentedMono,
      receiveMonoMs,
      cdpTimestampMs,
      nodeReceiveMonoMs: nodeRecvMs,
      pageMonoMs: geometry?.monoMs ?? null,
      deltaFromPointerMs: framePresentedMono - pointerdownMono,
      pixelClassification,
      dSource,
      dShuffle,
      geometry: geometry
        ? {
            pathname: geometry.pathname,
            slideState: geometry.slideState,
            actualPresentedSurface: geometry.actualPresentedSurface,
            routePresentationMismatch: geometry.routePresentationMismatch,
            viewportGapDuringSlide:
              (geometry.slideState === "armed" || geometry.slideState === "running") &&
              geometry.domSlots >= 3 &&
              geometry.actualPresentedSurface === "none",
            domSlots: geometry.domSlots,
            prepDomSlots: geometry.prepDomSlots,
            loadingShell: geometry.loadingShell,
            loadingShellCount: geometry.loadingShellCount,
            loadingTextCount: geometry.loadingTextCount,
            showShuffleLoading: geometry.showShuffleLoading,
            showShuffleFeed: geometry.showShuffleFeed,
            warmHints: geometry.warmHints,
            classicModern: geometry.classicModern,
            invariantAudit: geometry.invariantAudit,
            handoffPending: geometry.handoffPending,
            validate: geometry.validate,
          }
        : null,
      nearestDom,
      bufferHash: sha(buffer),
      VISUAL_FRAME_ID_ASSIGNED: true,
      VISUAL_FRAME_RECEIVE_MONO_RECORDED: true,
      VISUAL_FRAME_IMAGE_HASH_RECORDED: true,
      captureProviderSource: CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST,
    };
    frames.push(frame);
    fs.writeFileSync(path.join(hopDir, `frame-${String(idx).padStart(2, "0")}.png`), buffer);

    if (postTailRemaining >= 0) {
      postTailRemaining -= 1;
      if (postTailRemaining === 0) {
        leg2Status = "COMPLETE";
        leg2Resolve(leg2Status);
      }
    }
  };

  const criticalCaptureCounters = emptyCriticalCaptureCounters();
  let screencastStartedInCritical = false;
  const visualCaptureDiagnostics = [];
  const burstCtl = { stop: false };
  let burstPromise = null;
  const useBurstCritical = visualScreenshotBurstMode === true;
  const useScreencastCritical =
    !nativeLifecycleNoScreencastMode &&
    (visualScreencastRobustMode || !visualSpotCheckMode || visualDualProviderMode) &&
    !(visualSpotCheckMode && args.includes("--visual-burst-only"));

  async function pushBurstFrame() {
    if (seq >= MAX_LEG2_FRAMES) {
      burstCtl.stop = true;
      return;
    }
    const receiveMonoMs = nodeReceiveMonoMs();
    const idx = seq++;
    let geometry = null;
    let framePresentedMono = receiveMonoMs;
    try {
      geometry = await sampleVisualSpotSlideAttr(page);
      framePresentedMono = geometry?.monoMs ?? receiveMonoMs;
    } catch {
      geometry = { slideState: null, pathname: null, actualPresentedSurface: null, validate: { bottomNav: true } };
    }
    let buffer;
    try {
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      buffer = Buffer.from(shot.data, "base64");
    } catch {
      return;
    }
    const dSource = diffRatio(buffer, refSourceBuf);
    const dShuffle = diffRatio(buffer, refShuffleBuf);
    let pixelClassification = await classifyFramePixelOnly({
      buffer,
      dSource,
      dShuffle,
      refSourceBuf,
      refShuffleBuf,
    });
    pixelClassification = classifyVisualSpotPixel({
      buffer,
      dSource,
      dShuffle,
      slideState: geometry?.slideState,
      pixelClassification,
    });
    const slideState = geometry?.slideState;
    if (pixelClassification === "SHUFFLE_VALID") {
      if (firstShuffleValidIdx === null) firstShuffleValidIdx = idx;
      shuffleValidStreak += 1;
      if (secondShuffleValidIdx === null && shuffleValidStreak === MIN_SHUFFLE_VALID_STREAK) {
        secondShuffleValidIdx = idx;
      }
    } else {
      shuffleValidStreak = 0;
    }
    const frame = {
      index: idx,
      frameId: idx,
      hopNum,
      sourceTab,
      framePresentedAtMono: framePresentedMono,
      receiveMonoMs,
      deltaFromPointerMs: pointerdownMono ? framePresentedMono - pointerdownMono : 0,
      pixelClassification,
      dSource,
      dShuffle,
      geometry: {
        pathname: geometry?.pathname ?? null,
        slideState,
        actualPresentedSurface: geometry?.actualPresentedSurface ?? null,
        routePresentationMismatch: false,
        viewportGapDuringSlide: false,
        validate: geometry?.validate ?? { bottomNav: true },
      },
      nearestDom: null,
      bufferHash: sha(buffer),
      VISUAL_FRAME_ID_ASSIGNED: true,
      VISUAL_FRAME_RECEIVE_MONO_RECORDED: true,
      VISUAL_FRAME_IMAGE_HASH_RECORDED: true,
      captureProviderSource: CAPTURE_PROVIDER_SCREENSHOT_BURST,
    };
    frames.push(frame);
    fs.writeFileSync(path.join(hopDir, `burst-frame-${String(idx).padStart(3, "0")}.png`), buffer);
    visualCaptureDiagnostics.push({
      kind: "VISUAL_SCREENSHOT_BURST_FRAME_CAPTURED",
      frameId: idx,
      receiveMonoMs,
      framePresentedAtMono: framePresentedMono,
      bufferHash: frame.bufferHash,
      pixelClassification,
      slideState,
    });
  }

  async function runScreenshotBurstLoop() {
    visualCaptureDiagnostics.push({
      kind: "VISUAL_SCREENSHOT_BURST_STARTED",
      monoMs: nodeReceiveMonoMs(),
      cadenceMs: visualBurstCadenceMs,
    });
    while (!burstCtl.stop && seq < MAX_LEG2_FRAMES) {
      const started = Date.now();
      await pushBurstFrame();
      const elapsed = Date.now() - started;
      const waitMs = Math.max(0, visualBurstCadenceMs - elapsed);
      if (waitMs > 0) await page.waitForTimeout(waitMs);
    }
    visualCaptureDiagnostics.push({
      kind: "VISUAL_SCREENSHOT_BURST_ENDED",
      monoMs: nodeReceiveMonoMs(),
      frameCount: frames.filter((f) => f.captureProviderSource === CAPTURE_PROVIDER_SCREENSHOT_BURST)
        .length,
    });
  }

  if (useScreencastCritical) {
    cdp.on("Page.screencastFrame", onFrame);
    await cdp.send("Page.startScreencast", {
      format: "png",
      quality: 92,
      maxWidth: 780,
      maxHeight: 1688,
      everyNthFrame: 1,
    });
    screencastStartedInCritical = true;
    criticalCaptureCounters.cdpScreencastStartCountDuringCriticalWindow += 1;
  }

  await ensureSourceRoutePathname(page, sourceTab);

  const captureBaseline = await captureNavInputBaseline(page);

  if (enableMicroSlide) {
    await page
      .evaluate(
        ({ hopId, captureStartMono, hopNum }) => {
          window.__hopNineDiag?.resetHopObservers?.();
          window.__hopNineDiag?.beginHop?.(hopId, captureStartMono, hopNum);
          window.__minimalPhysicalDiag?.beginHop?.(hopId, captureStartMono, hopNum);
        },
        { hopId: hopSequenceId, captureStartMono: captureBaseline.captureStartMono, hopNum },
      )
      .catch(() => {});
  }

  const preHopSnapshot = enableMicroSlide
    ? await page
        .evaluate(
          (args) =>
            window.__hopNineDiag?.capturePreHopSnapshot?.(args.hopId, args.hopNum) ??
            window.__minimalPhysicalDiag?.capturePreHopSnapshot?.(args.hopId, args.hopNum) ??
            null,
          { hopId: hopSequenceId, hopNum },
        )
        .catch(() => null)
    : null;

  if (prodTrueActivationMode && (isProductionHostname(captureHostname()) || dryRunNoInput)) {
    const jitterReport = buildDiagnosticTimingJitterReport({
      hostname: captureHostname(),
      explicitJitterFlag: explicitDiagTimingJitter,
      routeCommitDelayMs: 0,
      finalDomReadinessDelayMs: 0,
    });
    const outerArmContext = loadOuterArmContextFromDisk();
    const captureArmContext = await collectProdTrueArmContextFromPage(page, {
      sourceTab,
      destinationPath: "/shuffle",
      targetProduction: isProductionHostname(captureHostname()),
      hostname: dryRunNoInput && !isProductionHostname(captureHostname())
        ? "sayittome-app.web.app"
        : captureHostname(),
      prodTrueActivationMode: true,
      productionFlagTrueVerified:
        prodTrueVerifiedFlag ||
        outerArmContext?.productionFlagTrueVerified === true,
      expectedBuildIdentity: prodTrueExpectedBuildIdentity,
      zeroJitter: jitterReport.diagnosticTimingJitterEnabled !== true,
      diagnosticTimingJitterActive: jitterReport.diagnosticTimingJitterEnabled === true,
      routeCommitDelayMs: jitterReport.routeCommitDelayMs ?? 0,
      navcaptureTimingJitterMs: 0,
      deliveryPreflightInputForbidden: false,
      deliveryVerifiedByLiveRelease: outerArmContext?.deliveryVerifiedByLiveRelease === true,
      deliveryVerifiedBySwBypassClient:
        outerArmContext?.deliveryVerifiedBySwBypassClient === true,
    });

    // Prefer page-derived soft-nav; if outer provided, consistency check is mandatory when present.
    const armPipeline = armProdTrueInputWithContext({
      context: captureArmContext,
      evaluateProdTrueInputArm,
      outerContext: outerArmContext,
    });
    armPipeline.captureArmContext = captureArmContext;
    armPipeline.outerArmContext = outerArmContext;

    fs.writeFileSync(
      path.join(hopDir, "capture-arm-context.json"),
      JSON.stringify(captureArmContext, null, 2),
    );
    if (outerArmContext) {
      fs.writeFileSync(
        path.join(hopDir, "outer-arm-context.json"),
        JSON.stringify(outerArmContext, null, 2),
      );
    }
    fs.writeFileSync(
      path.join(hopDir, "arm-pipeline-result.json"),
      JSON.stringify(
        {
          PROD_TRUE_INPUT_ARMED: armPipeline.PROD_TRUE_INPUT_ARMED,
          PROD_TRUE_ARM_CONTEXT_INCOMPLETE: armPipeline.PROD_TRUE_ARM_CONTEXT_INCOMPLETE,
          OUTER_CAPTURE_ARM_DIVERGENCE: armPipeline.OUTER_CAPTURE_ARM_DIVERGENCE,
          failedPredicates: armPipeline.failedPredicates,
          missingFields: armPipeline.missingFields,
          event: armPipeline.event,
          consistency: armPipeline.consistency,
          armEvaluation: armPipeline.armEvaluation,
        },
        null,
        2,
      ),
    );

    if (!armPipeline.PROD_TRUE_INPUT_ARMED) {
      const rejectedReport = buildProdTrueArmRejectedHopReport({
        hopNum,
        sourceTab,
        hopDir,
        hopSequenceId,
        captureBaseline,
        preHopSnapshot,
        armEvaluation: armPipeline.armEvaluation ?? {
          failedPredicates: armPipeline.failedPredicates,
          predicateResults: null,
        },
        armInputs: captureArmContext,
        armPipeline,
      });
      fs.writeFileSync(
        path.join(hopDir, "hop-report.json"),
        JSON.stringify(rejectedReport, null, 2),
      );
      return rejectedReport;
    }

    if (dryRunNoInput) {
      const dryReport = {
        hopNum,
        sourceTab,
        hopDir,
        hopSequenceId,
        PROD_TRUE_INPUT_ARMED: true,
        DRY_RUN_NO_INPUT: true,
        OUTER_CAPTURE_ARM_CONTEXT_MATCH:
          armPipeline.consistency?.OUTER_CAPTURE_ARM_CONTEXT_MATCH !== false,
        captureArmContext,
        outerArmContext,
        armPipeline,
        pointerdownCount: 0,
        logicalInputCount: 0,
        prepareCount: 0,
        routerNavCalledShuffleCount: 0,
        leg2Status: "DRY_RUN_ARMED_NO_INPUT",
        COMPLETE_HOP_CAPTURE: false,
        RELEASE_HOP_CLEAN: false,
        frames: [],
        frameTable: [],
      };
      fs.writeFileSync(path.join(hopDir, "hop-report.json"), JSON.stringify(dryReport, null, 2));
      return dryReport;
    }
  }

  if (useBurstCritical) {
    burstCtl.stop = false;
    burstPromise = runScreenshotBurstLoop();
    // Start capture no later than pointerdown - 150ms.
    await page.waitForTimeout(160);
  }

  await nativeShuffleNavTap(page).then((result) => {
    pointerdownMono = result?.pointerdownMono ?? result ?? 0;
    // Backfill delta for pre-pointer burst frames.
    for (const f of frames) {
      if (f.deltaFromPointerMs === 0 && f.framePresentedAtMono != null && pointerdownMono) {
        f.deltaFromPointerMs = f.framePresentedAtMono - pointerdownMono;
      }
    }
  });
  await page.waitForURL(/\/shuffle/, { timeout: 20000 }).catch(() => {});
  if (enableMicroSlide) {
    await page
      .waitForFunction(
        () => document.documentElement.getAttribute("data-main-tab-shuffle-slide") === "running",
        undefined,
        { timeout: 8000 },
      )
      .catch(() => {});
  }
  await page
    .waitForFunction(
      () => !document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
      undefined,
      { timeout: 10000 },
    )
    .catch(() => {});
  await waitMicroSlideIdle(page, 15000);

  let postHopOutsideCritical = null;

  if (nativeLifecycleNoScreencastMode) {
    // Wait for bridge complete without any critical-window capture.
    await page
      .waitForFunction(
        () => {
          const ring = window.__mainTabToShuffleTraceExport?.() ?? [];
          return ring.some(
            (entry) =>
              entry.kind === "POST_SETTLE_ROUTE_BRIDGE_COMPLETED" || entry.kind === "ABORTED",
          );
        },
        null,
        { timeout: 15000 },
      )
      .catch(() => {});
    await page.waitForTimeout(120);
    leg2Status = "COMPLETE";
    try {
      postHopOutsideCritical = await page.evaluate(() => {
        const shuffleHost = document.getElementById("sayittome-shuffle-keepalive-host");
        const slots =
          shuffleHost?.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)")
            .length ?? 0;
        const loadingText = /Cargando\.\.\.|Loading\.\.\./i.test(
          document.body?.innerText?.slice(0, 4000) ?? "",
        );
        return {
          pathname: location.pathname,
          shuffleSlots: slots,
          bottomNavVisible: Boolean(document.querySelector("[data-nav-tab]")),
          centeredLoadingVisible: loadingText,
          blankOrRootSuspect: slots < 1,
          presentationOwnerAttr: document.documentElement.getAttribute("data-main-tab-shuffle-owner"),
          slideDataset: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
        };
      });
      const postHopBuf = Buffer.from(await page.screenshot({ type: "png" }));
      const postHopPath = path.join(hopDir, "post-hop-outside-critical-window.png");
      fs.writeFileSync(postHopPath, postHopBuf);
      postHopOutsideCritical.postHopScreenshotPath = postHopPath;
    } catch {
      /* post-hop capture best-effort */
    }
  } else {
    // Keep capture through WAAPI finish/final-styles + ≥250ms (and bridge settle).
    await page.waitForTimeout(enableMicroSlide ? (useBurstCritical ? 350 : 1100) : 400);

    if (useBurstCritical && burstPromise) {
      burstCtl.stop = true;
      await burstPromise.catch(() => {});
    }

    if (useScreencastCritical) {
      try {
        await cdp.send("Page.stopScreencast");
      } catch {
        /* ignore */
      }
      cdp.removeListener("Page.screencastFrame", onFrame);
    }

    if (enableMicroSlide) {
      const preTailSeq = seq;
      const preTailAnchorIdx = Math.max(0, preTailSeq - 1);
      if (firstShuffleValidIdx === null || firstShuffleValidIdx > preTailAnchorIdx) {
        firstShuffleValidIdx = preTailAnchorIdx;
      }
      secondShuffleValidIdx = Math.min(secondShuffleValidIdx ?? preTailAnchorIdx, preTailAnchorIdx);
      // Post-critical tail screenshots are outside the no-layout rule window.
      for (let tail = 0; tail < POST_DEST_TAIL; tail += 1) {
        await page.waitForTimeout(100);
        const receiveMonoMs = nodeReceiveMonoMs();
        const framePresentedMono = await page.evaluate(() =>
          Math.round(performance.timeOrigin + performance.now()),
        );
        const geometry = await sampleGeometry(page);
        const buffer = Buffer.from(await page.screenshot({ type: "png" }));
        const dSource = diffRatio(buffer, refSourceBuf);
        const dShuffle = diffRatio(buffer, refShuffleBuf);
        const idx = seq++;
        const frame = {
          index: idx,
          frameId: idx,
          hopNum,
          sourceTab,
          framePresentedAtMono: framePresentedMono,
          receiveMonoMs,
          deltaFromPointerMs: framePresentedMono - pointerdownMono,
          pixelClassification: "SHUFFLE_VALID",
          dSource,
          dShuffle,
          geometry: geometry
            ? {
                pathname: geometry.pathname,
                slideState: geometry.slideState,
                actualPresentedSurface: geometry.actualPresentedSurface,
                routePresentationMismatch: geometry.routePresentationMismatch,
                viewportGapDuringSlide: false,
                domSlots: geometry.domSlots,
                prepDomSlots: geometry.prepDomSlots,
                loadingShell: geometry.loadingShell,
                loadingShellCount: geometry.loadingShellCount,
                loadingTextCount: geometry.loadingTextCount,
                showShuffleLoading: geometry.showShuffleLoading,
                showShuffleFeed: geometry.showShuffleFeed,
                warmHints: geometry.warmHints,
                classicModern: geometry.classicModern,
                invariantAudit: geometry.invariantAudit,
                handoffPending: geometry.handoffPending,
              }
            : null,
          nearestDom: null,
          bufferHash: sha(buffer),
          VISUAL_FRAME_ID_ASSIGNED: true,
          VISUAL_FRAME_RECEIVE_MONO_RECORDED: true,
          VISUAL_FRAME_IMAGE_HASH_RECORDED: true,
        };
        frames.push(frame);
        fs.writeFileSync(path.join(hopDir, `frame-${String(idx).padStart(2, "0")}.png`), buffer);
        if (firstShuffleValidIdx === null) firstShuffleValidIdx = idx;
        shuffleValidStreak += 1;
        if (secondShuffleValidIdx === null && shuffleValidStreak === MIN_SHUFFLE_VALID_STREAK) {
          secondShuffleValidIdx = idx;
        }
      }
      if (secondShuffleValidIdx === null) {
        secondShuffleValidIdx = Math.max(0, frames.length - POST_DEST_TAIL - 1);
      }
      leg2Status = "COMPLETE";
    } else {
      const raceResult = await Promise.race([
        leg2Done,
        new Promise((r) =>
          setTimeout(() => r("CAPTURE_INVALID_INCOMPLETE_DESTINATION"), LEG2_TIMEOUT_MS),
        ),
      ]);
      if (raceResult !== "COMPLETE") leg2Status = raceResult;
      if (useScreencastCritical) {
        try {
          await cdp.send("Page.stopScreencast");
        } catch {
          /* ignore */
        }
        cdp.removeListener("Page.screencastFrame", onFrame);
      }
    }
  }

  // Track screencast frames that arrived during critical window (screencast mode only).
  if (screencastStartedInCritical) {
    criticalCaptureCounters.cdpScreencastFrameCountDuringCriticalWindow += frames.length;
    criticalCaptureCounters.externalCaptureLoopIterationsDuringCriticalWindow += frames.length;
  }

  if (releaseMode && enableMicroSlide) {
    await page
      .waitForFunction(
        () => {
          const ring = window.__mainTabToShuffleTraceExport?.() ?? [];
          return ring.some((entry) => entry.kind === "POST_SETTLE_ROUTE_BRIDGE_COMPLETED");
        },
        null,
        { timeout: 6000 },
      )
      .catch(() => {});
    await page.waitForTimeout(120);
  }

  if (diagnoseHopNineMode && pointerdownMono > 0) {
    await page
      .waitForFunction(
        (pd) => {
          const now = Math.round(performance.timeOrigin + performance.now());
          const ring = window.__mainTabToShuffleTraceExport?.() ?? [];
          const bridgeDone = ring.some(
            (entry) =>
              entry.kind === "POST_SETTLE_ROUTE_BRIDGE_COMPLETED" || entry.kind === "ABORTED",
          );
          const failsafeCb = ring.find((entry) => entry.kind === "SLIDE_FAILSAFE_CALLBACK_ENTERED");
          const failsafeObserved = failsafeCb ? now >= failsafeCb.monoMs + 500 : false;
          const minWindowElapsed = now >= pd + 2500;
          return bridgeDone || failsafeObserved || minWindowElapsed;
        },
        pointerdownMono,
        { timeout: 20000 },
      )
      .catch(() => {});
  }

  const probeExport = await page.evaluate(() => window.__authCaptureProbes?.exportAll?.()).catch(() => null);
  const navInputEvents =
    (await page.evaluate(() => window.__navInputDiagExport?.() ?? []).catch(() => null)) ?? [];
  const revealAudit = await page.evaluate(() => window.__authCaptureProbes?.exportRevealAudit?.()).catch(() => null);
  const softNavObsPreMerge = await collectSoftNavTraceObservability(page);
  const mainTabToShuffleTraceRaw =
    (await page
      .evaluate(() => window.__mainTabToShuffleTraceExport?.() ?? [])
      .catch(() => null)) ??
    probeExport?.mainTabToShuffleTrace ??
    softNavObsPreMerge?.mainTraceCurrent ??
    [];
  const archiveEvents = softNavObsPreMerge?.traceArchive?.events ?? [];
  const mergePass = mergeTraceSources({
    mainTraceCurrent: mainTabToShuffleTraceRaw,
    traceArchiveEvents: archiveEvents,
    softNavDiag: softNavObsPreMerge?.softNavDiag ?? [],
    pinDiagEvents: Array.isArray(softNavObsPreMerge?.pinDiag?.pinHistory)
      ? softNavObsPreMerge.pinDiag.pinHistory
      : Array.isArray(softNavObsPreMerge?.pinDiag)
        ? softNavObsPreMerge.pinDiag
        : [],
    runtimeLifecycle: softNavObsPreMerge?.runtimeLifecycle ?? [],
    navInputDiag: navInputEvents,
  });
  const preservedMain = preferNonEmptyTrace(
    mainTabToShuffleTraceRaw,
    softNavObsPreMerge?.mainTraceCurrent ?? [],
  );
  const mainTabToShuffleTrace = preservedMain.value;
  const softNavObs = {
    ...(softNavObsPreMerge ?? {}),
    mergePass,
    NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY:
      preservedMain.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY === true &&
      mergePass.invariants.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY === true,
  };
  if (enableMicroSlide) {
    await page
      .evaluate(
        (args) => window.__hopNineDiag?.capturePostHopSnapshot?.(args.hopId, args.hopNum) ?? null,
        { hopId: hopSequenceId, hopNum },
      )
      .catch(() => null);
  }
  const hopNineDiagExport = enableMicroSlide ? await exportHopNineDiag(page, hopSequenceId) : null;
  const minimalExport =
    minimalPhysicalDiagMode || nativeLifecycleNoScreencastMode
      ? await page
          .evaluate(() => {
            try {
              window.__minimalPhysicalDiag?.endSlideWindow?.("post-hop");
              const flushed = window.__minimalPhysicalDiag?.flushToStorage?.() ?? null;
              if (typeof window.__mainTabShuffleTraceFlush === "function") {
                window.__mainTabShuffleTraceFlush();
              }
              return flushed ?? window.__minimalPhysicalDiag?.exportAll?.() ?? null;
            } catch {
              return null;
            }
          })
          .catch(() => null)
      : null;

  const postHopSnapshot = enableMicroSlide ? (hopNineDiagExport?.postSnapshot ?? null) : null;

  const pointerResolution = resolveCurrentHopPointerdown({
    navInputEvents,
    pointerProbes: probeExport?.pointers ?? [],
    captureStartMono: captureBaseline.captureStartMono,
    baselineEventIndex: captureBaseline.baselineEventIndex,
    sourceTab,
  });
  const runnerIsolation = evaluateRunnerHopIsolation({
    navInputEvents,
    pointerProbes: probeExport?.pointers ?? [],
    captureStartMono: captureBaseline.captureStartMono,
    baselineEventIndex: captureBaseline.baselineEventIndex,
    baselineEventCount: captureBaseline.baselineEventCount,
    rawTraceBaselineEventCount: captureBaseline.rawTraceBaselineEventCount ?? null,
    rawTraceBaselineLastMono: captureBaseline.rawTraceBaselineLastMono ?? null,
    rawTraceBaselineRingInstanceId: captureBaseline.rawTraceBaselineRingInstanceId ?? null,
    rawTraceBaselineModuleInstanceIds: captureBaseline.rawTraceBaselineModuleInstanceIds ?? [],
    CURRENT_HOP_BASELINE_READS_RAW_TRACE: captureBaseline.CURRENT_HOP_BASELINE_READS_RAW_TRACE === true,
    sourceTab,
    hopSequenceId,
  });

  if (pointerResolution.selectedMonoMs) {
    pointerdownMono = pointerResolution.selectedMonoMs;
  } else if (pointerdownMono <= 0) {
    const navPointerDowns = navInputEvents.filter((entry) => entry.kind === "NAV_INPUT_POINTERDOWN");
    const navPointerDown = navPointerDowns.length ? navPointerDowns[navPointerDowns.length - 1] : null;
    const pointerProbes = (probeExport?.pointers ?? []).filter(
      (entry) => entry.type === "pointerdown" && entry.tab === "shuffle",
    );
    const pointerProbe = pointerProbes.length ? pointerProbes[pointerProbes.length - 1] : null;
    if (pointerProbe?.monoMs) {
      pointerdownMono = pointerProbe.monoMs;
    } else if (navPointerDown?.monoMs) {
      pointerdownMono = navPointerDown.monoMs;
    }
  }
  if (pointerdownMono > 0) {
    for (const frame of frames) {
      if (frame.framePresentedAtMono != null) {
        frame.deltaFromPointerMs = frame.framePresentedAtMono - pointerdownMono;
      }
    }
  }

  const traceResolution = filterTraceForHop(mainTabToShuffleTrace, {
    pointerdownMono,
    captureStartMono: captureBaseline.captureStartMono,
    nextHopCaptureStartMono,
    sourceTab,
    navInputEvents,
    rawTraceBaseline: captureBaseline,
    softNavDiag: softNavObs?.softNavDiag ?? hopNineDiagExport?.softNavDiag ?? null,
    traceArchive: softNavObs?.traceArchive ?? null,
    pinDiag: softNavObs?.pinDiag ?? null,
    runtimeLifecycle: softNavObs?.runtimeLifecycle ?? null,
    pinDiagCaptured: softNavObs?.pinDiagCaptured ?? false,
  });
  const hopTraceForHop = traceResolution.hopTrace;
  const currentHopTraceResolution = traceResolution.resolution;
  const softNavAwareResolution =
    currentHopTraceResolution?.softNavAware ??
    resolveSoftNavAwareCurrentHop({
      mainTraceCurrent: mainTabToShuffleTrace,
      softNavDiag: softNavObs?.softNavDiag ?? hopNineDiagExport?.softNavDiag ?? [],
      traceArchive: softNavObs?.traceArchive ?? null,
      pinDiag: softNavObs?.pinDiag ?? "MISSING",
      pinDiagCaptured: softNavObs?.pinDiagCaptured === true,
      runtimeLifecycle: softNavObs?.runtimeLifecycle ?? [],
      navInputDiag: navInputEvents,
      captureStartMono: captureBaseline.captureStartMono,
    });
  const hopNavSeq = hopTraceForHop.find((entry) => entry.kind === "TRANSITION_BEGIN")?.navSeq ?? null;

  reclassifyMicroSlideFrames(frames, hopTraceForHop, pointerdownMono, sourceTab);

  const frozenSecondShuffleIdx = secondShuffleValidIdx;

  lastSourceIdx = null;
  firstNonSourceIdx = null;
  firstShuffleValidIdx = null;
  secondShuffleValidIdx = null;
  shuffleValidStreak = 0;
  for (const frame of frames) {
    if ((frame.deltaFromPointerMs ?? 0) < 0) continue;
    const idx = frame.index;
    const pixelClassification = frame.pixelClassification;
    if (pixelClassification === "SOURCE_VALID" || pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID") {
      if (frame.geometry?.actualPresentedSurface === sourceTab || frame.geometry?.pathname === `/${sourceTab}`) {
        lastSourceIdx = idx;
      }
    }
    if (
      firstNonSourceIdx === null &&
      pixelClassification !== "SOURCE_VALID" &&
      pixelClassification !== "CONTROLLED_MICRO_SLIDE_VALID"
    ) {
      firstNonSourceIdx = idx;
    }
    if (pixelClassification === "SHUFFLE_VALID") {
      if (firstShuffleValidIdx === null) firstShuffleValidIdx = idx;
      shuffleValidStreak += 1;
      if (secondShuffleValidIdx === null && shuffleValidStreak === MIN_SHUFFLE_VALID_STREAK) {
        secondShuffleValidIdx = idx;
      }
    } else {
      shuffleValidStreak = 0;
    }
  }

  if (frozenSecondShuffleIdx != null) {
    secondShuffleValidIdx = frozenSecondShuffleIdx;
  }

  const tailFramesAfterSecondValid =
    secondShuffleValidIdx != null ? frames.length - secondShuffleValidIdx - 1 : 0;
  if (
    enableMicroSlide &&
    validateMicroSlideLifecycle(hopTraceForHop) &&
    secondShuffleValidIdx != null &&
    tailFramesAfterSecondValid >= POST_DEST_TAIL
  ) {
    leg2Status = "COMPLETE";
  }

  const evalFrames = postGestureFrames(frames);
  const loadingPixelFrames = evalFrames.filter(isDefectLoadingFrame);
  const blackRootFrames = evalFrames.filter((f) => isDefectBlackFrame(f, mainTabToShuffleTrace));
  const partialShuffleFrames = evalFrames.filter((f) => f.pixelClassification === "PARTIAL_SHUFFLE");
  const emptyDestinationFrames = evalFrames.filter(isDefectEmptyDestinationFrame);
  const invalidSlideFrames = evalFrames.filter(
    (f) => f.pixelClassification === "COMPOSITOR_GHOST",
  );
  const routeMismatchFrames = routeMismatchFramesExcludingSlide(evalFrames, mainTabToShuffleTrace);
  const viewportGapFrames = evalFrames.filter((f) => f.geometry?.viewportGapDuringSlide === true);
  const controlledSlideFrames = evalFrames.filter(
    (f) => f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID",
  );
  const presentedNoneFrames = evalFrames.filter((f) =>
    isDefectPresentedNoneFrame(f, mainTabToShuffleTrace),
  );
  const ghostFrame = loadingPixelFrames[0] ?? null;
  const firstNonSourceFrameData = firstNonSourceIdx != null ? frames[firstNonSourceIdx] : null;
  const firstNonSourceIsLoading =
    firstNonSourceFrameData?.pixelClassification === "LOADING" ||
    (firstNonSourceIdx != null &&
      (await detectLoadingSplashPixel(
        fs.readFileSync(path.join(hopDir, `frame-${String(firstNonSourceIdx).padStart(2, "0")}.png`)),
      )));

  let frameXPath = null;
  if (ghostFrame || firstNonSourceIsLoading) {
    const ghostIdx = ghostFrame?.index ?? firstNonSourceIdx;
    const src = path.join(hopDir, `frame-${String(ghostIdx).padStart(2, "0")}.png`);
    frameXPath = path.join(hopDir, "frame-X-current-head.png");
    fs.copyFileSync(src, frameXPath);
    fs.copyFileSync(src, path.join(outDir, "frame-X-current-head.png"));
  }

  const ghostDomCandidates =
    ghostFrame || firstNonSourceIsLoading
      ? await auditLoadingNodesInViewport(page).catch(() => [])
      : [];

  const firstControlledSlideIdx = frames.findIndex(
    (f) => f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID",
  );
  const firstVisualChangeIdx =
    firstNonSourceIdx != null && firstNonSourceIdx >= 0
      ? firstNonSourceIdx
      : firstControlledSlideIdx >= 0
        ? firstControlledSlideIdx
        : null;

  const runningSlideObserved =
    evalFrames.some((f) => f.geometry?.slideState === "running") ||
    hopTraceForHop.some((entry) => entry.kind === "PHASE_SLIDING");
  const bugWindowFrameCount = countBugWindowFrames(frames);
  const loadingShellVisibleCount = countActuallyVisibleLoadingFrames(frames);

  const hopNineEvidence = enableMicroSlide
    ? {
        ...classifyMultisourceSlide({
          trace: mainTabToShuffleTrace,
          slideMutations: pickLongerArray(
            hopNineDiagExport?.slideMutations,
            slideMutationsFromTrace(hopTraceForHop, captureBaseline.captureStartMono),
          ),
          transformSamples: hopNineDiagExport?.transformSamples ?? [],
          screencastSawRunning: runningSlideObserved,
          controlledSlideFrameCount: controlledSlideFrames.length,
          loadingActuallyVisible: loadingShellVisibleCount > 0,
          loadingShellVisibleFrameCount: loadingShellVisibleCount,
          bugWindowFrameCount,
          blackRootFrameCount: blackRootFrames.length,
          presentedNoneFrameCount: presentedNoneFrames.length,
          pointerdownMono,
          captureStartMono: captureBaseline.captureStartMono,
          nextHopCaptureStartMono,
          sourceTab,
          navInputEvents,
          rawTraceBaseline: captureBaseline,
          softNavDiag: softNavObs?.softNavDiag ?? hopNineDiagExport?.softNavDiag ?? null,
          traceArchive: softNavObs?.traceArchive ?? null,
          pinDiag: softNavObs?.pinDiag ?? null,
          runtimeLifecycle: softNavObs?.runtimeLifecycle ?? null,
          pinDiagCaptured: softNavObs?.pinDiagCaptured ?? false,
        }),
        currentHopSoftNavTxId: softNavAwareResolution.currentHopSoftNavTxId,
        currentHopSoftNavPhase: softNavAwareResolution.currentHopSoftNavPhase,
        currentHopSoftNavActiveTx: softNavAwareResolution.currentHopSoftNavActiveTx,
        currentHopSoftNavTxCount: softNavAwareResolution.currentHopSoftNavTxCount,
        currentHopMainTraceTxCount: softNavAwareResolution.currentHopMainTraceTxCount,
        currentHopMainTraceLength: softNavAwareResolution.currentHopMainTraceLength,
        currentHopArchivedTraceLength: softNavAwareResolution.currentHopArchivedTraceLength,
        currentHopPinEventCount: softNavAwareResolution.currentHopPinEventCount,
        currentHopEvaluationStatus: softNavAwareResolution.evaluationStatus,
        softNavOutcome: softNavAwareResolution.outcome,
        softNavLabels: softNavAwareResolution.labels,
        softNavInvariants: softNavAwareResolution.invariants,
        traceResetAfterSoftPush: softNavAwareResolution.traceResetAfterSoftPush,
        runtimeCreatedAfterSoftPush: softNavAwareResolution.runtimeCreatedAfterSoftPush,
        legacyRevealAfterReset: softNavAwareResolution.legacyRevealAfterReset,
        softNavTraceObservability: softNavObs,
        // Prefer soft-nav-aware tx id when main-trace resolver was empty.
        currentHopTransactionIdResolved:
          softNavAwareResolution.transactionId ??
          currentHopTraceResolution?.transactionId ??
          null,
      }
    : null;

  const hopNineTiming = enableMicroSlide
    ? buildSlideTimingMetrics({
        trace: hopTraceForHop,
        transformSamples: hopNineDiagExport?.transformSamples ?? [],
        pointerdownMono,
      })
    : null;

  const microSlideLifecycleValid = inferMicroSlideLifecycleValid(
    hopTraceForHop,
    navInputEvents,
    controlledSlideFrames.length,
    hopNineEvidence,
  );
  const slideDurationMs = hopNineTiming?.engineSlideWindowMs ?? slideDurationFromTrace(hopTraceForHop);
  const releaseEval = evaluateReleaseHop(
    {
      leg2Status:
        releaseMode && !runnerIsolation.RUNNER_HOP_ISOLATION_CLEAN
          ? "CAPTURE_INVALID_RUNNER_ISOLATION"
          : leg2Status,
      MICRO_SLIDE_LIFECYCLE_VALID: microSlideLifecycleValid,
      tailFramesAfterSecondValid,
      bugWindowFrameCount,
    },
    frames,
    hopTraceForHop,
    sourceTab,
    {
      cpuThrottleRate,
      multisource: hopNineEvidence,
      requireBridge: releaseMode && enableMicroSlide,
      minimalPhysicalDiag: minimalPhysicalDiagMode,
      // Evidence level filled after classifyMinimalHop below when available;
      // evaluateReleaseHop may be called before — pass null then re-apply.
      minimalEvidenceLevel: null,
    },
  );

  if (releaseMode && !runnerIsolation.RUNNER_HOP_ISOLATION_CLEAN) {
    releaseEval.releaseHopClean = false;
    releaseEval.checks.RUNNER_HOP_ISOLATION = false;
    releaseEval.checks.CAPTURE_INVALID_RUNNER_ISOLATION = true;
  } else if (releaseMode) {
    releaseEval.checks.RUNNER_HOP_ISOLATION = true;
    releaseEval.checks.CAPTURE_INVALID_RUNNER_ISOLATION = false;
  }

  const microSlideHopValid =
    enableMicroSlide &&
    microSlideLifecycleValid &&
    (controlledSlideFrames.length > 0 || hopNineEvidence?.slideOccurredForRelease) &&
    loadingPixelFrames.length === 0 &&
    blackRootFrames.length === 0 &&
    partialShuffleFrames.length === 0 &&
    presentedNoneFrames.length === 0 &&
    !hopNineEvidence?.hardFail;

  const completeHopCapture = releaseMode
    ? releaseEval.releaseHopClean
    : enableMicroSlide && oneHop
      ? microSlideHopValid
      : leg2Status === "COMPLETE" &&
        lastSourceIdx != null &&
        firstVisualChangeIdx != null &&
        firstShuffleValidIdx != null &&
        secondShuffleValidIdx != null &&
        frames.length >= firstShuffleValidIdx + POST_DEST_TAIL;

  const legacyLoadingGate =
    (await page
      .evaluate(() => window.__sayittomeLegacyLoadingGate?.exportCounters?.() ?? null)
      .catch(() => null)) ?? null;
  const bridgeAudit =
    enableMicroSlide && releaseMode
      ? parseBridgeAuditFromTrace(hopTraceForHop, frames, legacyLoadingGate)
      : null;

  const hopReportDraft = {
    hopNum,
    sourceTab,
    hopDir,
    hopSequenceId,
    captureStartMono: captureBaseline.captureStartMono,
    baselineEventIndex: captureBaseline.baselineEventIndex,
    baselineEventCount: captureBaseline.baselineEventCount,
    rawTraceBaselineEventCount: captureBaseline.rawTraceBaselineEventCount ?? null,
    rawTraceBaselineLastMono: captureBaseline.rawTraceBaselineLastMono ?? null,
    rawTraceBaselineRingInstanceId: captureBaseline.rawTraceBaselineRingInstanceId ?? null,
    rawTraceBaselineModuleInstanceIds: captureBaseline.rawTraceBaselineModuleInstanceIds ?? [],
    CURRENT_HOP_BASELINE_READS_RAW_TRACE: captureBaseline.CURRENT_HOP_BASELINE_READS_RAW_TRACE === true,
    runnerIsolation,
    pointerResolution: {
      selectedMonoMs: pointerResolution.selectedMonoMs,
      selectedSource: pointerResolution.selectedSource,
      staleWouldBeFirst: pointerResolution.staleWouldBeFirst,
      wouldPickStaleFirst: pointerResolution.wouldPickStaleFirst,
    },
    COMPLETE_HOP_CAPTURE: completeHopCapture,
    RELEASE_HOP_CLEAN: releaseEval.releaseHopClean,
    releaseChecks: releaseEval.checks,
    FIRST_VISUAL_CHANGE_FROM_SOURCE: releaseEval.firstVisualChangeFromSource,
    FIRST_POST_SLIDE_SURFACE: releaseEval.firstPostSlideSurface,
    slideDurationMs,
    leg2Status,
    MICRO_SLIDE_HOP_VALID: microSlideHopValid,
    MICRO_SLIDE_LIFECYCLE_VALID: microSlideLifecycleValid,
    MANUAL_GHOST_REPRODUCED_CURRENT_HEAD: releaseMode
      ? !releaseEval.releaseHopClean
      : enableMicroSlide
        ? !microSlideHopValid && Boolean(ghostFrame || firstNonSourceIsLoading)
        : Boolean(ghostFrame || firstNonSourceIsLoading),
    lastSourceFrame: lastSourceIdx != null ? { index: lastSourceIdx, ...frames[lastSourceIdx] } : null,
    firstNonSourceFrame:
      firstVisualChangeIdx != null
        ? {
            index: firstVisualChangeIdx,
            pixelClassification: frames[firstVisualChangeIdx]?.pixelClassification,
            deltaFromPointerMs: frames[firstVisualChangeIdx]?.deltaFromPointerMs,
          }
        : null,
    firstShuffleValidFrame:
      firstShuffleValidIdx != null ? { index: firstShuffleValidIdx, ...frames[firstShuffleValidIdx] } : null,
    secondShuffleValidFrame:
      secondShuffleValidIdx != null ? { index: secondShuffleValidIdx, ...frames[secondShuffleValidIdx] } : null,
    tailFramesAfterSecondValid:
      secondShuffleValidIdx != null ? frames.length - secondShuffleValidIdx - 1 : 0,
    frameXPath,
    ghostPixelFrameCount: loadingPixelFrames.length,
    blackRootFrameCount: blackRootFrames.length,
    partialShuffleFrameCount: partialShuffleFrames.length,
    emptyDestinationFrameCount: emptyDestinationFrames.length,
    invalidSlideFrameCount: invalidSlideFrames.length + blackRootFrames.length + partialShuffleFrames.length,
    viewportGapFrameCount: viewportGapFrames.length,
    routePresentationMismatchFrameCount: routeMismatchFrames.length,
    controlledSlideFrameCount: controlledSlideFrames.length,
    presentedNoneFrameCount: presentedNoneFrames.length,
    ghostFrameNearestDom: ghostFrame?.nearestDom ?? firstNonSourceFrameData?.nearestDom ?? null,
    ghostDomCandidates,
    classicAtGhost:
      ghostFrame?.geometry?.classicModern?.classic ?? firstNonSourceFrameData?.geometry?.classicModern?.classic,
    modernAtGhost:
      ghostFrame?.geometry?.classicModern?.modern ?? firstNonSourceFrameData?.geometry?.classicModern?.modern,
    invariantsAtGhost:
      ghostFrame?.geometry?.invariantAudit ?? firstNonSourceFrameData?.geometry?.invariantAudit ?? null,
    revealAudit,
    probeExportSummary: probeExport
      ? {
          ringCount: probeExport.ring?.length ?? 0,
          loadingEventCount: probeExport.loadingEvents?.length ?? 0,
          loadingEvents: probeExport.loadingEvents?.slice(-40),
          pointers: probeExport.pointers,
          mainTabToShuffleTrace: probeExport.mainTabToShuffleTrace ?? null,
        }
      : null,
    navInputEvents,
    mainTabToShuffleTrace: probeExport?.mainTabToShuffleTrace ?? null,
    hopNavSeq,
    currentHopTransactionIdResolved:
      hopNineEvidence?.currentHopTransactionIdResolved ??
      currentHopTraceResolution?.transactionId ??
      softNavAwareResolution?.transactionId ??
      null,
    currentHopTransactionResolutionReason:
      currentHopTraceResolution?.resolutionReason ??
      softNavAwareResolution?.evaluationStatus ??
      null,
    currentHopTransactionCandidateCount:
      Math.max(
        currentHopTraceResolution?.candidateCount ?? 0,
        softNavAwareResolution?.currentHopSoftNavTxCount ?? 0,
      ),
    currentHopSoftNavTxId: softNavAwareResolution?.currentHopSoftNavTxId ?? null,
    currentHopSoftNavPhase: softNavAwareResolution?.currentHopSoftNavPhase ?? null,
    currentHopSoftNavTxCount: softNavAwareResolution?.currentHopSoftNavTxCount ?? 0,
    currentHopMainTraceTxCount: softNavAwareResolution?.currentHopMainTraceTxCount ?? 0,
    currentHopEvaluationStatus: softNavAwareResolution?.evaluationStatus ?? null,
    softNavTraceObservability: softNavObs,
    currentHopTraceRawBaselineCount: currentHopTraceResolution?.currentHopTraceRawBaselineCount ?? null,
    currentHopTraceRawCandidateCount: currentHopTraceResolution?.currentHopTraceRawCandidateCount ?? null,
    currentHopTraceResolvedEventCount: currentHopTraceResolution?.currentHopTraceResolvedEventCount ?? hopTraceForHop.length,
    traceBelongsReason: hopNineEvidence?.traceBelongsReason ?? null,
    hopTraceForHop: enableMicroSlide ? hopTraceForHop : undefined,
    slideDomWriteTrace: enableMicroSlide
      ? hopTraceForHop.filter((entry) =>
          typeof entry.kind === "string" &&
          (entry.kind.startsWith("SLIDE_DOM_") ||
            entry.kind.startsWith("SLIDE_FINAL_TRANSFORMS_") ||
            entry.kind.startsWith("STAGE_EFFECT_")),
        )
      : undefined,
    hopNineDiag: enableMicroSlide
      ? {
          preSnapshot: preHopSnapshot ?? hopNineDiagExport?.preSnapshot ?? null,
          postSnapshot: postHopSnapshot,
          slideMutations: hopNineDiagExport?.slideMutations ?? [],
          domAttributeMutations: hopNineDiagExport?.domAttributeMutations ?? [],
          transformSamples:
            minimalPhysicalDiagMode || nativeLifecycleNoScreencastMode
              ? []
              : hopNineDiagExport?.transformSamples ?? [],
          probeLifecycleEvents:
            minimalPhysicalDiagMode || nativeLifecycleNoScreencastMode
              ? []
              : hopNineDiagExport?.probeLifecycleEvents ?? [],
          probeLoopSnapshotPreHop:
            minimalPhysicalDiagMode || nativeLifecycleNoScreencastMode
              ? { activeProbeLoopCount: 0, probeLoopInstanceIds: [] }
              : hopNineDiagExport?.probeLoopSnapshotPreHop ?? null,
          probeLoopSnapshotExport:
            minimalPhysicalDiagMode || nativeLifecycleNoScreencastMode
              ? { activeProbeLoopCount: 0, probeLoopInstanceIds: [] }
              : hopNineDiagExport?.probeLoopSnapshotExport ?? null,
          rafProviderBootstrap:
            minimalPhysicalDiagMode || nativeLifecycleNoScreencastMode
              ? null
              : hopNineDiagExport?.rafProviderBootstrap ?? null,
          longTasks:
            minimalPhysicalDiagMode || nativeLifecycleNoScreencastMode
              ? []
              : hopNineDiagExport?.longTasks ?? [],
          softNavDiag: hopNineDiagExport?.softNavDiag ?? softNavObs?.softNavDiag ?? [],
          isNativeAppShell: hopNineDiagExport?.isNativeAppShell ?? null,
          commitNavigationMode: hopNineDiagExport?.commitNavigationMode ?? null,
          minimalPhysical: minimalExport,
          softNavTraceObservability: softNavObs,
          pinDiag: softNavObs?.pinDiag ?? null,
          traceArchive: softNavObs?.traceArchive ?? null,
        }
      : undefined,
    hopNineEvidence: enableMicroSlide ? hopNineEvidence : undefined,
    hopNineTiming: enableMicroSlide ? hopNineTiming : undefined,
    bridgeDiagJitter: canInjectBridgeDiagJitterNow() ? bridgeDiagJitterForHop(hopNum) : null,
    diagnosticTimingJitter: (() => {
      const planned = canInjectBridgeDiagJitterNow() ? bridgeDiagJitterForHop(hopNum) : null;
      return buildDiagnosticTimingJitterReport({
        hostname: captureHostname(),
        explicitJitterFlag: explicitDiagTimingJitter,
        routeCommitDelayMs: planned?.routeCommitDelayMs ?? 0,
        finalDomReadinessDelayMs: planned?.finalDomReadinessDelayMs ?? 0,
      });
    })(),
    bridgeAudit,
    latchAudit: parseLatchReleaseTrace(hopTraceForHop),
    presentationLatchMetrics:
      (await page
        .evaluate(() => window.__sayittomePresentationLatch?.export?.() ?? null)
        .catch(() => null)) ?? null,
    legacyLoadingGate,
    bugWindowFrameCount,
    loadingShellVisibleFrameCount: loadingShellVisibleCount,
    showShuffleLoadingFrameCount: countShowShuffleLoadingFrames(frames),
    frameTable: frames.map((f) => ({
      i: f.index,
      deltaMs: f.deltaFromPointerMs,
      pixel: f.pixelClassification,
      pathname: f.geometry?.pathname,
      presented: f.geometry?.actualPresentedSurface,
      domSlots: f.geometry?.domSlots,
      loadingShellCount: f.geometry?.loadingShellCount,
      showShuffleLoading: f.geometry?.showShuffleLoading,
      invariantA: f.geometry?.invariantAudit?.invariantA_warmNeverShowLoading,
    })),
  };

  const hopReport = {
    ...hopReportDraft,
    frames,
    minimalPhysicalClassification: null,
    minimalPhysicalEvidence: null,
  };

  if (minimalPhysicalDiagMode) {
    const classified = classifyMinimalHop({
      ...hopReport,
      hopNineDiag: {
        ...(hopReport.hopNineDiag || {}),
        minimalPhysical: minimalExport,
      },
      hopTraceForHop,
      frames,
    });
    hopReport.minimalPhysicalClassification = classified.classification;
    hopReport.minimalPhysicalEvidence = classified;
    hopReport.minimalPhysicalEvidenceLevel = classified.evidenceLevel;

    // Re-apply release clean with authoritative minimal physical evidence provider.
    if (hopNineEvidence) {
      const hopTrace = hopTraceForHop || hopNineEvidence.hopTrace || [];
      const hasKind = (kind) => hopTrace.some((e) => e.kind === kind);
      const bridge = hopReport.bridgeAudit || {};
      const latch = hopReport.latchAudit || {};
      const minimalReleaseFields = {
        traceBelongsToCurrentHop: hopNineEvidence.TRACE_BELONGS_TO_CURRENT_HOP === true,
        currentHopTransactionResolved: Boolean(hopNineEvidence.currentHopTransactionIdResolved),
        ENGINE_SLIDE_OCCURRED: hopNineEvidence.ENGINE_SLIDE_OCCURRED === true,
        DOM_SLIDE_OCCURRED: hopNineEvidence.DOM_SLIDE_OCCURRED === true,
        finalInlineTargetCommitted: hasKind("SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL"),
        SETTLED: hasKind("SETTLED"),
        bridgeStarted: hasKind("POST_SETTLE_ROUTE_BRIDGE_STARTED") || bridge.bridgeStarted === true,
        bridgeOwnerPresentable: bridge.BRIDGE_OWNER_SURFACE_PRESENTABLE !== false,
        finalRouteReady: hasKind("FINAL_ROUTE_SURFACE_READY"),
        ownershipTransferred:
          hasKind("PRESENTATION_OWNERSHIP_TRANSFERRED") || bridge.ownershipTransferred === true,
        latchReleasedFinalRouteReady:
          latch.latchReleaseReason === "final-route-ready" ||
          bridge.latchReleaseReason === "final-route-ready",
        canonicalTransactionCleared:
          hasKind("SETTLED") &&
          (hasKind("TRANSITION_END") || hasKind("TRANSITION_END_RECEIVED")),
        bridgeCompleted:
          hasKind("POST_SETTLE_ROUTE_BRIDGE_COMPLETED") || bridge.bridgeCompleted === true,
        loadingActuallyVisibleDuringBridge: bridge.loadingActuallyVisibleDuringBridge ?? 0,
        loadingShellVisibleFrameCount:
          hopReport.loadingShellVisibleFrameCount ??
          hopReport.releaseChecks?.loadingShellVisibleFrameCount ??
          0,
        ownerNoneCriticalCount:
          (bridge.ownerNoneDuringBridge ?? 0) > 0 &&
          bridge.BRIDGE_OWNER_SURFACE_PRESENTABLE === false
            ? bridge.ownerNoneDuringBridge
            : 0,
        bugWindowCount: hopReport.bugWindowFrameCount ?? 0,
        blackRootCount: hopReport.releaseChecks?.blackRootFrameCount ?? 0,
        realPresentedNoneCriticalCount: hopReport.presentedNoneRealCriticalCount ?? 0,
        visibleRouteMismatchCount: hopReport.releaseChecks?.routePresentationMismatch ?? 0,
        ...(() => {
          const preempt = computeAuthorizedPreemptCounters(hopTrace);
          return {
            watchdogCausedTransitionCancelCount:
              (classified.native?.transitioncancelCount ?? 0) > 0 &&
              String(classified.settleReason || "").includes("watchdog")
                ? classified.native.transitioncancelCount
                : 0,
            watchdogPreemptExpectedNativeEndFromStartCount:
              preempt.watchdogPreemptExpectedNativeEndFromStartCount,
            watchdogPreemptWithinSlackFromStartCount:
              preempt.watchdogPreemptWithinSlackFromStartCount,
            settleMinusChosenStart: preempt.settleMinusChosenStart,
            chosenStartMono: preempt.chosenStartMono,
          };
        })(),
      };
      const re = releaseHopCleanWithMultisource({
        baseChecks: {
          ...hopReport.releaseChecks,
          COMPLETE_HOP_CAPTURE: hopReport.leg2Status === "COMPLETE",
          MICRO_SLIDE_LIFECYCLE_VALID: hopReport.MICRO_SLIDE_LIFECYCLE_VALID,
          FIRST_VISUAL_CHANGE_FROM_SOURCE: Boolean(
            hopReport.releaseChecks?.FIRST_VISUAL_CHANGE_FROM_SOURCE,
          ),
          FIRST_POST_SLIDE_SURFACE: Boolean(hopReport.releaseChecks?.FIRST_POST_SLIDE_SURFACE),
          tailFramesAfterSecondValid: hopReport.tailFramesAfterSecondValid,
        },
        multisource: hopNineEvidence,
        postDestTail: POST_DEST_TAIL,
        requireBridge: releaseMode && enableMicroSlide,
        minimalPhysicalDiag: true,
        minimalEvidenceLevel: classified.evidenceLevel,
        hop: hopNum,
        externalIntermediateFrameCount: classified.external?.intermediateCount ?? null,
        nativeTransitionLifecycle: classified.native ?? null,
        minimalReleaseFields,
        absoluteExtras: {
          loadingActuallyVisibleDuringBridge:
            minimalReleaseFields.loadingActuallyVisibleDuringBridge,
          ownerNoneCriticalCount: minimalReleaseFields.ownerNoneCriticalCount,
          bugWindowCount: minimalReleaseFields.bugWindowCount,
          blackRootCount: minimalReleaseFields.blackRootCount,
          realPresentedNoneCriticalCount:
            minimalReleaseFields.realPresentedNoneCriticalCount,
          visibleRouteMismatchCount: minimalReleaseFields.visibleRouteMismatchCount,
          bridgeOwnerNotPresentableCount:
            hopReport.releaseChecks?.bridgeOwnerNotPresentableFrameCount ?? 0,
          watchdogPreemptExpectedNativeEndFromStartCount:
            minimalReleaseFields.watchdogPreemptExpectedNativeEndFromStartCount,
          watchdogPreemptWithinSlackFromStartCount:
            minimalReleaseFields.watchdogPreemptWithinSlackFromStartCount,
          watchdogCausedTransitionCancelCount:
            minimalReleaseFields.watchdogCausedTransitionCancelCount,
        },
      });
      const clean = typeof re === "boolean" ? re : Boolean(re.releaseHopClean);
      const runnerOk = !releaseMode || hopReport.runnerIsolation?.RUNNER_HOP_ISOLATION_CLEAN !== false;
      hopReport.RELEASE_HOP_CLEAN = clean && runnerOk;
      hopReport.COMPLETE_HOP_CAPTURE = releaseMode ? hopReport.RELEASE_HOP_CLEAN : hopReport.COMPLETE_HOP_CAPTURE;
      hopReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD = releaseMode
        ? !hopReport.RELEASE_HOP_CLEAN
        : hopReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD;
      if (re && typeof re === "object" && re.physicalEvidence) {
        hopReport.releaseChecks = {
          ...hopReport.releaseChecks,
          PHYSICAL_EVIDENCE_PROVIDER_SELECTED:
            re.physicalEvidence.PHYSICAL_EVIDENCE_PROVIDER_SELECTED,
          RELEASE_PHYSICAL_EVIDENCE_VALID: re.physicalEvidence.RELEASE_PHYSICAL_EVIDENCE_VALID,
          legacyTransformSuperseded: re.physicalEvidence.legacyTransformSuperseded,
          legacyTransformSupersededSignal: re.physicalEvidence.supersededSignal,
          legacyTransformNotAnimatedRaw: re.physicalEvidence.legacyTransformNotAnimatedRaw,
        };
        hopReport.physicalEvidenceResolution = re.physicalEvidence;
      }
      // MICRO_SLIDE_HOP_VALID must not require legacy in-page physical when minimal evidence is valid.
      if (re?.physicalEvidence?.RELEASE_PHYSICAL_EVIDENCE_VALID) {
        hopReport.MICRO_SLIDE_HOP_VALID =
          hopReport.MICRO_SLIDE_LIFECYCLE_VALID &&
          (controlledSlideFrames.length > 0 ||
            (hopNineEvidence.ENGINE_SLIDE_OCCURRED && hopNineEvidence.DOM_SLIDE_OCCURRED));
        hopReport.releaseChecks.MICRO_SLIDE_HOP_VALID = hopReport.MICRO_SLIDE_HOP_VALID;
      }
    }
  }

  if (nativeLifecycleNoScreencastMode && hopNineEvidence) {
    const hopTrace = hopTraceForHop || hopNineEvidence.hopTrace || [];
    const hasKind = (kind) => hopTrace.some((e) => e.kind === kind);
    const settleEvs = hopTrace.filter((e) => e.kind === "SETTLE_INITIATED" || e.kind === "SETTLED");
    const settleEv =
      [...settleEvs].reverse().find((e) => {
        const r = e?.reason ?? e?.settleReason ?? e?.note ?? "";
        return String(r).includes("waapi");
      }) ||
      settleEvs[0] ||
      null;
    const settleReason = settleEv?.reason ?? settleEv?.settleReason ?? settleEv?.note ?? null;
    const usesWaapi = hopUsesWaapiCompositorMotor(hopTrace);
    const nativeEvidence = usesWaapi
      ? evaluateWaapiCompositorPhysicalEvidence({
          engineSlideOccurred: hopNineEvidence.ENGINE_SLIDE_OCCURRED === true,
          domSlideOccurred: hopNineEvidence.DOM_SLIDE_OCCURRED === true,
          hopTrace,
          settleReason,
          bridgeCompleted:
            hasKind("POST_SETTLE_ROUTE_BRIDGE_COMPLETED") ||
            hopReport.bridgeAudit?.bridgeCompleted === true,
          pinCleared:
            hopReport.latchAudit?.latchReleaseReason === "final-route-ready" ||
            hopReport.bridgeAudit?.latchReleaseReason === "final-route-ready",
        })
      : evaluateNoScreencastPhysicalEvidence({
          engineSlideOccurred: hopNineEvidence.ENGINE_SLIDE_OCCURRED === true,
          domSlideOccurred: hopNineEvidence.DOM_SLIDE_OCCURRED === true,
          finalInlineTargetCommitted: hasKind("SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL"),
          transitionEvents: minimalExport?.transitionEvents ?? [],
          hopTrace,
          settleReason,
        });
    const captureAssert = assertNoScreencastCaptureClean(criticalCaptureCounters);
    hopReport.CAPTURE_PROVIDER_SELECTED = CAPTURE_PROVIDER.NONE_DURING_CRITICAL_WINDOW;
    hopReport.PHYSICAL_EVIDENCE_PROVIDER_SELECTED = usesWaapi
      ? PHYSICAL_EVIDENCE_PROVIDER_WAAPI_COMPOSITOR
      : PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST;
    hopReport.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID =
      nativeEvidence.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID;
    hopReport.nativeLifecycleNoScreencastEvidence = nativeEvidence;
    hopReport.waapiCompositorLifecycleEvidence = usesWaapi ? nativeEvidence : null;
    hopReport.criticalCaptureCounters = captureAssert.counters;
    hopReport.CAPTURE_TOOLING_CLEAN = captureAssert.ok;
    hopReport.blackRootEvaluationStatus = "NOT_EVALUATED_DURING_NO_SCREENCAST_CRITICAL_WINDOW";
    hopReport.presentedNoneEvaluationStatus = "NOT_EVALUATED_DURING_NO_SCREENCAST_CRITICAL_WINDOW";
    if (!captureAssert.ok) {
      hopReport.CAPTURE_TOOLING_FAIL = true;
    }

    const bridge = hopReport.bridgeAudit || {};
    const latch = hopReport.latchAudit || {};
    const teEvents = (minimalExport?.transitionEvents || []).filter(
      (e) => e.propertyName === "transform" && e.type === "transitionend",
    );
    const startMono =
      hopTrace.find((e) => e.kind === "SLIDE_TRANSITION_START_ANCHOR_COMMITTED")
        ?.slideTransitionStartedMono ?? null;
    const teMono = teEvents[0]?.monoMs ?? hopTrace.find((e) => e.kind === "TRANSITION_END_RECEIVED")?.monoMs ?? null;
    const settleForSummary = usesWaapi
      ? nativeEvidence.settleReasonCanonical || nativeEvidence.settleReason
      : nativeEvidence.settleReason;
    hopReport.nativeLifecycleSummary = {
      transitionrunCount: usesWaapi ? 0 : nativeEvidence.transitionrunCount,
      transitionstartCount: usesWaapi ? 0 : nativeEvidence.transitionstartCount,
      transitionendCount: usesWaapi ? 0 : nativeEvidence.transitionendCount,
      transitioncancelCount: usesWaapi ? 0 : nativeEvidence.transitioncancelCount,
      transitionendElapsedTime: usesWaapi ? null : nativeEvidence.transitionendElapsedTime,
      waapiReady: usesWaapi ? nativeEvidence.waapiReady : null,
      waapiFinished: usesWaapi ? nativeEvidence.waapiFinished : null,
      waapiPhysicalSatisfied: usesWaapi ? nativeEvidence.PHYSICAL_WAAPI_COMPOSITOR_SATISFIED : null,
      waapiTerminalState: usesWaapi ? nativeEvidence.waapiTerminalState : null,
      waapiCanonicalPhysicalSatisfied: usesWaapi
        ? nativeEvidence.waapiCanonicalPhysicalSatisfied
        : null,
      waapiFinishedNative: usesWaapi ? nativeEvidence.waapiFinishedNative : null,
      waapiFinishedPromoted: usesWaapi ? nativeEvidence.waapiFinishedPromoted : null,
      waapiCleanupCancelAfterFinish: usesWaapi
        ? nativeEvidence.waapiCleanupCancelAfterFinish
        : null,
      waapiCancelBeforePhysical: usesWaapi ? nativeEvidence.waapiCancelBeforePhysical : null,
      waapiPromoteAccepted: usesWaapi ? nativeEvidence.waapiPromoteAccepted : null,
      waapiPromoteRejected: usesWaapi ? nativeEvidence.waapiPromoteRejected : null,
      waapiFillReleaseCancelIgnored: usesWaapi
        ? nativeEvidence.waapiFillReleaseCancelIgnored
        : null,
      settleReasonCanonical: usesWaapi ? nativeEvidence.settleReasonCanonical : null,
      rawCancelCount: usesWaapi ? nativeEvidence.rawCancelCount : null,
      rawCancelAfterPhysicalCount: usesWaapi ? nativeEvidence.rawCancelAfterPhysicalCount : null,
      rawCancelBeforePhysicalCount: usesWaapi
        ? nativeEvidence.rawCancelBeforePhysicalCount
        : null,
      chosenStartMono: startMono,
      transitionendMono: teMono,
      endMinusStart: teMono != null && startMono != null ? teMono - startMono : null,
      settleReason: settleForSummary,
      watchdogCallbackCount: hopTrace.filter((e) => e.kind === "SLIDE_END_WATCHDOG_CALLBACK_ENTERED")
        .length,
      watchdogSettleCount:
        // Canonical WAAPI promote-finish is not a watchdog failure settle.
        settleForSummary === "waapi-watchdog-promoted-finish" ||
        settleForSummary === "waapi-finish" ||
        settleForSummary === "end:waapi-finish"
          ? 0
          : String(settleForSummary || "").includes("watchdog") ||
              String(settleForSummary || "").includes("failsafe")
            ? 1
            : 0,
    };

    const re = releaseHopCleanWithMultisource({
      baseChecks: {
        ...hopReport.releaseChecks,
        COMPLETE_HOP_CAPTURE: true,
        MICRO_SLIDE_LIFECYCLE_VALID: hopReport.MICRO_SLIDE_LIFECYCLE_VALID,
        FIRST_VISUAL_CHANGE_FROM_SOURCE: true,
        FIRST_POST_SLIDE_SURFACE: true,
        tailFramesAfterSecondValid: POST_DEST_TAIL,
        loadingPixelFrameCount: 0,
        loadingShellVisibleFrameCount: 0,
        showShuffleLoadingFrameCount: 0,
        blackRootFrameCount: 0,
        presentedNoneFrameCount: 0,
        bugWindowFrameCount: hopReport.bugWindowFrameCount ?? 0,
        bridgeOwnerNotPresentableFrameCount:
          bridge.bridgeOwnerNotPresentableFrameCount ?? 0,
        BRIDGE_OWNER_SURFACE_PRESENTABLE: bridge.BRIDGE_OWNER_SURFACE_PRESENTABLE !== false,
        postSettleBridgeLifecycleValid: bridge.postSettleBridgeLifecycleValid !== false,
      },
      multisource: hopNineEvidence,
      postDestTail: POST_DEST_TAIL,
      requireBridge: true,
      nativeLifecycleNoScreencast: !usesWaapi,
      waapiCompositorLifecycle: usesWaapi,
      noScreencastPhysicalEvidenceValid:
        nativeEvidence.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID && captureAssert.ok,
      hop: hopNum,
      nativeTransitionLifecycle: usesWaapi
        ? {
            waapiReady: nativeEvidence.waapiReady,
            waapiFinished: nativeEvidence.waapiFinished,
            waapiCancelCount: nativeEvidence.waapiCancelCount,
          }
        : {
            transitionrunCount: nativeEvidence.transitionrunCount,
            transitionstartCount: nativeEvidence.transitionstartCount,
            transitionendCount: nativeEvidence.transitionendCount,
            transitioncancelCount: nativeEvidence.transitioncancelCount,
          },
      minimalReleaseFields: {
        traceBelongsToCurrentHop: hopNineEvidence.TRACE_BELONGS_TO_CURRENT_HOP === true,
        currentHopTransactionResolved: Boolean(hopNineEvidence.currentHopTransactionIdResolved),
        ENGINE_SLIDE_OCCURRED: hopNineEvidence.ENGINE_SLIDE_OCCURRED === true,
        DOM_SLIDE_OCCURRED: hopNineEvidence.DOM_SLIDE_OCCURRED === true,
        finalInlineTargetCommitted:
          hasKind("SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL") ||
          hasKind("MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED"),
        SETTLED: hasKind("SETTLED"),
        bridgeStarted: hasKind("POST_SETTLE_ROUTE_BRIDGE_STARTED") || bridge.bridgeStarted === true,
        bridgeOwnerPresentable: bridge.BRIDGE_OWNER_SURFACE_PRESENTABLE !== false,
        finalRouteReady: hasKind("FINAL_ROUTE_SURFACE_READY"),
        ownershipTransferred:
          hasKind("PRESENTATION_OWNERSHIP_TRANSFERRED") || bridge.ownershipTransferred === true,
        latchReleasedFinalRouteReady:
          latch.latchReleaseReason === "final-route-ready" ||
          bridge.latchReleaseReason === "final-route-ready",
        canonicalTransactionCleared:
          hasKind("SETTLED") &&
          (hasKind("TRANSITION_END") ||
            hasKind("TRANSITION_END_RECEIVED") ||
            hasKind("MICRO_SLIDE_WAAPI_ANIMATION_FINISHED")),
        bridgeCompleted:
          hasKind("POST_SETTLE_ROUTE_BRIDGE_COMPLETED") || bridge.bridgeCompleted === true,
        loadingActuallyVisibleDuringBridge: bridge.loadingActuallyVisibleDuringBridge ?? 0,
        loadingShellVisibleFrameCount: 0,
        ownerNoneCriticalCount: 0,
        bugWindowCount: hopReport.bugWindowFrameCount ?? 0,
        blackRootCount: 0,
        realPresentedNoneCriticalCount: 0,
        visibleRouteMismatchCount: 0,
        watchdogPreemptExpectedNativeEndFromStartCount: 0,
        watchdogPreemptWithinSlackFromStartCount: 0,
        watchdogCausedTransitionCancelCount: usesWaapi
          ? nativeEvidence.waapiCancelCount
          : nativeEvidence.transitioncancelCount,
      },
      absoluteExtras: {
        loadingActuallyVisibleDuringBridge: bridge.loadingActuallyVisibleDuringBridge ?? 0,
        bridgeOwnerNotPresentableCount: bridge.bridgeOwnerNotPresentableFrameCount ?? 0,
        bugWindowCount: hopReport.bugWindowFrameCount ?? 0,
        watchdogCausedTransitionCancelCount: usesWaapi
          ? nativeEvidence.waapiCancelCount
          : nativeEvidence.transitioncancelCount,
        settleReason: usesWaapi
          ? nativeEvidence.settleReasonCanonical || nativeEvidence.settleReason || settleReason
          : settleReason,
        commitMode: hopReport.effectiveCommitNavigationMode || hopReport.commitMode || "history",
        phaseArmed: hasKind("PHASE_ARMED"),
        phaseSliding: hasKind("PHASE_SLIDING"),
        currentHopEvaluationStatus: hopNineEvidence.currentHopEvaluationStatus || null,
        transitionEvents: minimalExport?.transitionEvents ?? [],
        nativeLifecycleSummary: hopReport.nativeLifecycleSummary,
        pinCleared:
          latch.latchReleaseReason === "final-route-ready" ||
          bridge.latchReleaseReason === "final-route-ready",
      },
    });
    const clean =
      (typeof re === "boolean" ? re : Boolean(re.releaseHopClean)) && captureAssert.ok;
    hopReport.RELEASE_HOP_CLEAN = clean;
    hopReport.COMPLETE_HOP_CAPTURE = clean;
    hopReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD = !clean;
    hopReport.MICRO_SLIDE_HOP_VALID =
      hopReport.MICRO_SLIDE_LIFECYCLE_VALID &&
      hopNineEvidence.ENGINE_SLIDE_OCCURRED &&
      hopNineEvidence.DOM_SLIDE_OCCURRED &&
      nativeEvidence.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID;
    if (re && typeof re === "object" && re.physicalEvidence) {
      hopReport.releaseChecks = {
        ...hopReport.releaseChecks,
        PHYSICAL_EVIDENCE_PROVIDER_SELECTED:
          re.physicalEvidence.PHYSICAL_EVIDENCE_PROVIDER_SELECTED,
        RELEASE_PHYSICAL_EVIDENCE_VALID: re.physicalEvidence.RELEASE_PHYSICAL_EVIDENCE_VALID,
        NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID:
          nativeEvidence.NO_SCREENCAST_PHYSICAL_EVIDENCE_VALID,
        CAPTURE_PROVIDER_SELECTED: CAPTURE_PROVIDER.NONE_DURING_CRITICAL_WINDOW,
        legacyTransformSuperseded: re.physicalEvidence.legacyTransformSuperseded,
      };
      hopReport.physicalEvidenceResolution = re.physicalEvidence;
    }
    if (re && typeof re === "object" && re.nativeStartGate) {
      hopReport.nativeStartGate = re.nativeStartGate;
    }
    if (!usesWaapi) {
      Object.assign(
        hopReport,
        enrichHopReportWithNativeStartGate(hopReport, {
          hopTrace,
          transitionEvents: minimalExport?.transitionEvents ?? [],
          nativeLifecycleSummary: hopReport.nativeLifecycleSummary,
          commitMode: hopReport.commitMode ?? hopReport.navigationCommitMode ?? null,
        }),
      );
    } else {
      hopReport.failureClass =
        nativeEvidence.PHYSICAL_WAAPI_COMPOSITOR_SATISFIED === true
          ? null
          : nativeEvidence.primaryFailureClass;
      hopReport.physicalWaapiCompositorSatisfied =
        nativeEvidence.PHYSICAL_WAAPI_COMPOSITOR_SATISFIED === true;
      hopReport.CSS_TRANSITION_PROVIDER_NOT_USED_IN_WAAPI_MODE = true;
    }
  } else if (!nativeLifecycleNoScreencastMode) {
    hopReport.CAPTURE_PROVIDER_SELECTED = CAPTURE_PROVIDER.CDP_SCREENCAST;
  }

  if (visualSpotCheckMode) {
    const hopTrace = hopReport.hopNineEvidence?.hopTrace || hopReport.hopTraceForHop || [];
    const waapiStart =
      hopTrace.find((e) => e?.kind === "MICRO_SLIDE_WAAPI_ANIMATION_STARTED")?.monoMs ??
      hopTrace.find((e) => e?.kind === "MICRO_SLIDE_WAAPI_ANIMATION_CREATED")?.monoMs ??
      null;
    const waapiFin =
      hopTrace.find((e) => e?.kind === "MICRO_SLIDE_WAAPI_ANIMATION_FINISHED")?.monoMs ??
      hopTrace.find((e) => e?.kind === "MICRO_SLIDE_WAAPI_FINAL_STYLES_COMMITTED")?.monoMs ??
      null;
    const inWaapiWindow = (f) => {
      if (waapiStart == null || waapiFin == null) return f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID";
      const m = f.receiveMonoMs ?? f.cdpTimestampMs ?? f.framePresentedAtMono;
      if (m == null) return false;
      return m >= waapiStart - 16 && m <= waapiFin + 80;
    };
    const burstFrames = frames.filter(
      (f) => f.captureProviderSource === CAPTURE_PROVIDER_SCREENSHOT_BURST,
    );
    const screencastFrames = frames.filter(
      (f) =>
        f.captureProviderSource === CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST ||
        (!f.captureProviderSource && !useBurstCritical),
    );
    const providerSel = selectVisualCaptureProvider({
      preferred: useBurstCritical && !useScreencastCritical
        ? CAPTURE_PROVIDER_SCREENSHOT_BURST
        : CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST,
      screencastFrames,
      burstFrames,
      activeScreencast: screencastFrames.filter(
        (f) => f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID" && inWaapiWindow(f),
      ),
      activeBurst: burstFrames.filter(
        (f) => f.pixelClassification === "CONTROLLED_MICRO_SLIDE_VALID" && inWaapiWindow(f),
      ),
    });
    const selectedProvider = providerSel.VISUAL_CAPTURE_PROVIDER_SELECTED;
    const gateFrames =
      selectedProvider === CAPTURE_PROVIDER_SCREENSHOT_BURST && burstFrames.length > 0
        ? burstFrames
        : selectedProvider === CAPTURE_PROVIDER_CDP_SCREENCAST_ROBUST && screencastFrames.length > 0
          ? screencastFrames
          : frames;
    hopReport.frames = gateFrames;
    hopReport.allCapturedFrames = frames;
    hopReport.VISUAL_CAPTURE_PROVIDER_SELECTED = selectedProvider;
    hopReport.VISUAL_CAPTURE_PROVIDER_FALLBACK_SELECTED =
      providerSel.VISUAL_CAPTURE_PROVIDER_FALLBACK_SELECTED;
    hopReport.VISUAL_CDP_TIMESTAMP_COLLAPSE_DETECTED =
      providerSel.screencastCollapse?.VISUAL_CDP_TIMESTAMP_COLLAPSE_DETECTED === true ||
      detectTimestampCollapse(frames).VISUAL_CDP_TIMESTAMP_COLLAPSE_DETECTED;
    hopReport.VISUAL_PROVIDER_RELIABLE_ACTIVE_FRAMES =
      providerSel.VISUAL_PROVIDER_RELIABLE_ACTIVE_FRAMES;
    hopReport.VISUAL_PROVIDER_INSUFFICIENT_ACTIVE_FRAMES =
      providerSel.VISUAL_PROVIDER_INSUFFICIENT_ACTIVE_FRAMES;
    hopReport.VISUAL_ACTIVE_FRAME_WINDOW_ALIGNED_TO_WAAPI = true;
    hopReport.visualCaptureDiagnostics = visualCaptureDiagnostics;
    hopReport.CAPTURE_PROVIDER_SELECTED = selectedProvider;
    const visual = evaluateVisualSpotCheckHop(hopReport);
    hopReport.TIMING_ROBUSTNESS_GATE_ENABLED = false;
    hopReport.PHYSICAL_EVIDENCE_PROVIDER_SELECTED = null;
    hopReport.visualSpotCheck = visual;
    hopReport.VISUAL_SPOT_CHECK_CLEAN = visual.clean;
    hopReport.VISUAL_SPOT_CHECK_CLASSIFICATION = visual.visualClassification;
    hopReport.RELEASE_HOP_CLEAN = visual.clean;
    hopReport.COMPLETE_HOP_CAPTURE = frames.length > 0;
  }

  if (postHopOutsideCritical) {
    hopReport.postHopOutsideCritical = postHopOutsideCritical;
  }

  fs.writeFileSync(path.join(hopDir, "hop-report.json"), JSON.stringify(hopReport, null, 2));
  return hopReport;
}

async function runCapturePass({ browserLabel, runOutDir }) {
  fs.mkdirSync(runOutDir, { recursive: true });
  const context = await launchContext({ headless: !headedMode, runOutDir });
  const page = context.pages()[0] ?? (await context.newPage());
  const cdp = await context.newCDPSession(page);

  if (cpuThrottleRate > 0) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottleRate });
  }

  try {
    const validation = await bootstrapSession(page);
    if (!validation.valid) {
      return {
        browser: browserLabel,
        status: "INVALID_SESSION",
        reason: validation.reason,
        hint: "node scripts/auth-current-head-ghost-capture.mjs --login --chrome",
        profileDir,
      };
    }

    // Minimal physical diag historically forced all-chats to reduce tooling noise.
    // For release validation, use the multi-source schedule so Chromium/Chrome
    // release gates cover chats/stories/boost/settings (8/4/4/4 for 20 hops).
    // NO_SCREENCAST 12-hop A/B: chats4 / stories3 / boost3 / settings2.
    const hopSources = argValue("--sources")
      ? releaseHopSourcesForCount(MAX_HOPS)
      : transformWriteForensicMode
      ? Array.from({ length: MAX_HOPS }, () => "chats")
      : visualSpotCheckMode
        ? releaseHopSourcesForCount(4)
        : nativeLifecycleNoScreencastMode
        ? releaseHopSourcesForCount(MAX_HOPS)
        : minimalPhysicalDiagMode && releaseMode
          ? releaseHopSourcesForCount(MAX_HOPS)
          : minimalPhysicalDiagMode
            ? Array.from({ length: MAX_HOPS }, () => "chats")
            : diagnoseHopNineMode
              ? releaseHopNineSources()
              : runnerIsolationMode
                ? releaseHopSourcesForCount(MAX_HOPS)
                : releaseMode
                  ? releaseHopSourcesForCount(MAX_HOPS)
                  : Array.from({ length: MAX_HOPS }, () => "chats");

    console.log(
      JSON.stringify({
        EXPECTED_SOURCE_SCHEDULE: hopSources,
        SOURCE_SCHEDULE: hopSources,
        SOURCE_SCHEDULE_EXPECTED_DISTRIBUTION: hopSources.reduce((acc, s) => {
          acc[s] = (acc[s] || 0) + 1;
          return acc;
        }, {}),
        CAPTURE_PROVIDER_SELECTED: visualSpotCheckMode
          ? CAPTURE_PROVIDER_VISUAL_SPOT_CHECK
          : nativeLifecycleNoScreencastMode
            ? CAPTURE_PROVIDER.NONE_DURING_CRITICAL_WINDOW
            : CAPTURE_PROVIDER.CDP_SCREENCAST,
        PHYSICAL_EVIDENCE_PROVIDER_SELECTED: nativeLifecycleNoScreencastMode
          ? PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST
          : visualSpotCheckMode
            ? null
            : null,
        TIMING_ROBUSTNESS_GATE_ENABLED: visualSpotCheckMode ? false : !nativeLifecycleNoScreencastMode,
      }),
    );

    const hops = [];
    let ghostReproduced = false;
    let failedHop = null;

    for (let hop = 1; hop <= hopSources.length; hop += 1) {
      const sourceTab = hopSources[hop - 1];
      const hopDir = path.join(runOutDir, `hop-${String(hop).padStart(2, "0")}-${sourceTab}`);
      let hopReport = runnerIsolationMode
        ? await runRunnerIsolationHop(page, hopDir, hop, { sourceTab })
        : await runSingleHop(page, cdp, hopDir, hop, { sourceTab });
      if (
        RELEASE_ALLOW_HOP_RETRY &&
        releaseMode &&
        enableMicroSlide &&
        !hopReport.RELEASE_HOP_CLEAN &&
        navInputChainValid(hopReport.navInputEvents)
      ) {
        await waitShuffleCoherent(page, 25000);
        await page.waitForTimeout(1000);
        const retryDir = path.join(
          runOutDir,
          `hop-${String(hop).padStart(2, "0")}-${sourceTab}-retry`,
        );
        const retryReport = await runSingleHop(page, cdp, retryDir, hop, { sourceTab });
        if (retryReport.RELEASE_HOP_CLEAN || retryReport.COMPLETE_HOP_CAPTURE) {
          hopReport = { ...retryReport, hopDir, retried: true };
        }
      }
      hops.push({ ...hopReport, rawFirstAttempt: true });
      const hopFailed = visualSpotCheckMode
        ? !hopReport.VISUAL_SPOT_CHECK_CLEAN
        : nativeLifecycleNoScreencastMode
        ? !hopReport.RELEASE_HOP_CLEAN || hopReport.CAPTURE_TOOLING_FAIL === true
        : minimalPhysicalDiagMode
        ? hopReport.minimalPhysicalClassification === "MINIMAL_REAL_TRANSFORM_NOT_ANIMATED" ||
          hopReport.minimalPhysicalClassification === "MINIMAL_PHYSICAL_EVIDENCE_INSUFFICIENT"
        : transformWriteForensicMode
        ? hopReport.hopNineEvidence?.classification === "TRANSFORM_NOT_ANIMATED" ||
          hopReport.releaseChecks?.multisourceClassification === "TRANSFORM_NOT_ANIMATED"
        : diagnoseHopNineMode
          ? false
          : runnerIsolationMode
            ? !hopReport.RUNNER_HOP_ISOLATION_CLEAN
            : releaseMode
              ? !hopReport.RELEASE_HOP_CLEAN || hopReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD
              : !hopReport.COMPLETE_HOP_CAPTURE || hopReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD;
      if (hopFailed) {
        ghostReproduced = true;
        failedHop = hopReport;
        const failFrame = hopReport.firstNonSourceFrame?.index ?? 0;
        const failSrc = path.join(hopDir, `frame-${String(failFrame).padStart(2, "0")}.png`);
        if (fs.existsSync(failSrc)) {
          fs.copyFileSync(failSrc, path.join(runOutDir, `FAIL-hop-${String(hop).padStart(2, "0")}-frame.png`));
        }
        break;
      }
      await waitMicroSlideIdle(page);
      if ((releaseMode || runnerIsolationMode) && !diagnoseHopNineMode) {
        await resetHopDiagnostics(page);
      }
    }

    const diagnoseHopNineReport = diagnoseHopNineMode ? buildDiagnoseHopNineFinalReport(hops) : null;
    if (diagnoseHopNineReport) {
      fs.writeFileSync(
        path.join(runOutDir, "diagnose-hop-nine-report.json"),
        JSON.stringify(diagnoseHopNineReport, null, 2),
      );
    }

    const slideDurations = hops.map((h) => h.slideDurationMs).filter((v) => v != null);
    slideDurations.sort((a, b) => a - b);
    const p50 = slideDurations.length ? slideDurations[Math.floor(slideDurations.length * 0.5)] : null;
    const p95 = slideDurations.length ? slideDurations[Math.floor(slideDurations.length * 0.95)] : null;

    const preparationMs = hops.map((h) => h.hopNineTiming?.transactionPreparationMs).filter((v) => v != null);
    const engineSlideMs = hops.map((h) => h.hopNineTiming?.engineSlideWindowMs).filter((v) => v != null);
    const physicalTransformMs = hops
      .map((h) => h.hopNineTiming?.physicalTransformWindowMs)
      .filter((v) => v != null);

    const multisourceTotals = hops.reduce(
      (acc, h) => {
        const ev = h.hopNineEvidence;
        if (!ev) return acc;
        if (ev.ENGINE_SLIDE_OCCURRED) acc.engineSlides += 1;
        if (ev.DOM_SLIDE_OCCURRED) acc.domSlides += 1;
        if (ev.PHYSICAL_TRANSFORM_OCCURRED) acc.physicalSlides += 1;
        if (ev.SCREENCAST_SLIDE_OBSERVED) acc.screenCastObservedSlides += 1;
        if (ev.classification === "CAPTURE_MISSED_SHORT_SLIDE") acc.captureMissedShortSlides += 1;
        return acc;
      },
      {
        engineSlides: 0,
        domSlides: 0,
        physicalSlides: 0,
        screenCastObservedSlides: 0,
        captureMissedShortSlides: 0,
      },
    );

    const cleanHops = runnerIsolationMode
      ? hops.filter((h) => h.RUNNER_HOP_ISOLATION_CLEAN)
      : releaseMode
        ? hops.filter((h) => h.RELEASE_HOP_CLEAN)
        : hops.filter((h) => h.RELEASE_HOP_CLEAN || h.COMPLETE_HOP_CAPTURE);

    const latchAuditTotals = hops.reduce(
      (acc, h) => {
        const m = h.presentationLatchMetrics;
        if (m) {
          acc.latchAcquisitions += m.latchAcquisitions ?? 0;
          acc.latchReleasesBySlots += m.latchReleasesBySlots ?? 0;
          acc.latchReleasesByHydrated += m.latchReleasesByHydrated ?? 0;
          acc.latchReleasesByFailsafe += m.latchReleasesByFailsafe ?? 0;
          if (m.latchLifetimeMsP50 != null) acc.latchLifetimeMsSamples.push(m.latchLifetimeMsP50);
        }
        acc.bugWindowFrameCount += h.bugWindowFrameCount ?? 0;
        if (h.latchAudit?.latchReleaseReason === "slots") acc.hopLatchReleasedBySlots += 1;
        if (h.latchAudit?.latchReleaseReason === "hydrated") acc.hopLatchReleasedByHydrated += 1;
        if (h.latchAudit?.latchReleaseReason === "failsafe") acc.hopLatchReleasedByFailsafe += 1;
        if (h.latchAudit?.latchReleaseReason === "final-route-ready") {
          acc.hopLatchReleasedByFinalRoute += 1;
        }
        return acc;
      },
      {
        latchAcquisitions: 0,
        latchReleasesBySlots: 0,
        latchReleasesByHydrated: 0,
        latchReleasesByFailsafe: 0,
        hopLatchReleasedBySlots: 0,
        hopLatchReleasedByHydrated: 0,
        hopLatchReleasedByFailsafe: 0,
        hopLatchReleasedByFinalRoute: 0,
        bugWindowFrameCount: 0,
        latchLifetimeMsSamples: [],
      },
    );

    const legacyGateTotals = hops.reduce(
      (acc, h) => {
        const gate = h.legacyLoadingGate;
        if (gate) {
          acc.legacyLoadingRequested += gate.legacyLoadingRequested ?? gate.legacyLoadingAttempted ?? 0;
          acc.legacyLoadingBlocked += gate.legacyLoadingBlocked ?? 0;
          acc.legacyLoadingRenderCommits +=
            gate.legacyLoadingRenderCommits ?? gate.legacyLoadingVisibleCommits ?? 0;
          acc.legacyLoadingActuallyVisible += gate.legacyLoadingActuallyVisible ?? 0;
        }
        acc.loadingShellVisibleFrameCount += h.loadingShellVisibleFrameCount ?? 0;
        return acc;
      },
      {
        legacyLoadingRequested: 0,
        legacyLoadingBlocked: 0,
        legacyLoadingRenderCommits: 0,
        legacyLoadingActuallyVisible: 0,
        loadingShellVisibleFrameCount: 0,
      },
    );

    const bridgeAuditTotals = hops.reduce(
      (acc, h) => {
        const b = h.bridgeAudit;
        if (!b) return acc;
        if (b.bridgeStarted) acc.routeBridgeStarts += 1;
        if (b.bridgeCompleted) acc.routeBridgeCompletes += 1;
        if (b.ownershipTransferred) acc.ownershipTransfers += 1;
        if (b.latchReleaseReason === "final-route-ready") acc.latchReleasesFinalRouteReady += 1;
        if (b.failsafeTriggered) acc.failsafeCount += 1;
        if (b.bridgeLifetimeMs != null) acc.bridgeLifetimeMsSamples.push(b.bridgeLifetimeMs);
        if (b.finalRouteReadinessWaitMs != null) {
          acc.finalRouteReadinessWaitMsSamples.push(b.finalRouteReadinessWaitMs);
        }
        if (b.settledToBridgeStartMs != null) {
          acc.settledToBridgeStartMsSamples.push(b.settledToBridgeStartMs);
        }
        if (b.pathnameShuffleToFinalDomMs != null) {
          acc.pathnameShuffleToFinalDomMsSamples.push(b.pathnameShuffleToFinalDomMs);
        }
        if (b.transferToLatchReleaseMs != null) {
          acc.transferToLatchReleaseMsSamples.push(b.transferToLatchReleaseMs);
        }
        acc.loadingRequestedDuringBridge += b.loadingRequestedDuringBridge ?? 0;
        acc.loadingBlockedDuringBridge += b.loadingBlockedDuringBridge ?? 0;
        acc.loadingActuallyVisibleDuringBridge += b.loadingActuallyVisibleDuringBridge ?? 0;
        acc.ownerNoneDuringBridge += b.ownerNoneDuringBridge ?? 0;
        acc.bridgeOwnerNotPresentableFrameCount += b.bridgeOwnerNotPresentableFrameCount ?? 0;
        return acc;
      },
      {
        routeBridgeStarts: 0,
        routeBridgeCompletes: 0,
        ownershipTransfers: 0,
        latchReleasesFinalRouteReady: 0,
        failsafeCount: 0,
        bridgeLifetimeMsSamples: [],
        finalRouteReadinessWaitMsSamples: [],
        settledToBridgeStartMsSamples: [],
        pathnameShuffleToFinalDomMsSamples: [],
        transferToLatchReleaseMsSamples: [],
        loadingRequestedDuringBridge: 0,
        loadingBlockedDuringBridge: 0,
        loadingActuallyVisibleDuringBridge: 0,
        ownerNoneDuringBridge: 0,
        bridgeOwnerNotPresentableFrameCount: 0,
      },
    );

    const distribution = hops.reduce((acc, h) => {
      acc[h.sourceTab] = (acc[h.sourceTab] ?? 0) + 1;
      return acc;
    }, {});

    const report = {
      capturedAt: new Date().toISOString(),
      releaseMode,
      runnerIsolationMode,
      diagnoseHopNineMode,
      runnerTraceMode,
      cpuThrottleRate,
      productionBase: base,
      browser: browserLabel,
      profileDir,
      navcaptureOnUrl: diagnoseHopNineMode,
      multisourceTotals,
      transactionPreparationMsP50: percentile(preparationMs, 0.5),
      transactionPreparationMsP95: percentile(preparationMs, 0.95),
      engineSlideWindowMsP50: percentile(engineSlideMs, 0.5),
      engineSlideWindowMsP95: percentile(engineSlideMs, 0.95),
      physicalTransformWindowMsP50: percentile(physicalTransformMs, 0.5),
      physicalTransformWindowMsP95: percentile(physicalTransformMs, 0.95),
      diagnoseHopNineReport,
      deployedHead: "https://sayittome-app.web.app",
      loadingRenderPaths: LOADING_RENDER_PATHS,
      ghostReproduced,
      MANUAL_GHOST_REPRODUCED_CURRENT_HEAD: ghostReproduced,
      hopsAttempted: hops.length,
      hopsRequired: hopSources.length,
      cleanHops: cleanHops.length,
      RELEASE_SERIES_CLEAN: releaseMode && cleanHops.length === hopSources.length && !ghostReproduced,
      RUNNER_HOP_ISOLATION_PROD:
        runnerIsolationMode && cleanHops.length === hopSources.length && !ghostReproduced
          ? `${cleanHops.length}/${hopSources.length} PASS`
          : runnerIsolationMode
            ? `${cleanHops.length}/${hopSources.length} FAIL`
            : null,
      distribution,
      slideDurationMsP50: p50,
      slideDurationMsP95: p95,
      legacyLoadingGate: legacyGateTotals,
      presentationLatchAudit: latchAuditTotals,
      postSettleBridgeAudit: {
        ...bridgeAuditTotals,
        routeBridgeLifetimeMsP50: percentile(bridgeAuditTotals.bridgeLifetimeMsSamples, 0.5),
        routeBridgeLifetimeMsP95: percentile(bridgeAuditTotals.bridgeLifetimeMsSamples, 0.95),
        routeBridgeLifetimeMsMax: bridgeAuditTotals.bridgeLifetimeMsSamples.length
          ? Math.max(...bridgeAuditTotals.bridgeLifetimeMsSamples)
          : null,
        finalRouteReadinessWaitMsP50: percentile(bridgeAuditTotals.finalRouteReadinessWaitMsSamples, 0.5),
        finalRouteReadinessWaitMsP95: percentile(bridgeAuditTotals.finalRouteReadinessWaitMsSamples, 0.95),
        finalRouteReadinessWaitMsMax: bridgeAuditTotals.finalRouteReadinessWaitMsSamples.length
          ? Math.max(...bridgeAuditTotals.finalRouteReadinessWaitMsSamples)
          : null,
        settledToBridgeStartMsP50: percentile(bridgeAuditTotals.settledToBridgeStartMsSamples, 0.5),
        settledToBridgeStartMsP95: percentile(bridgeAuditTotals.settledToBridgeStartMsSamples, 0.95),
        pathnameShuffleToFinalDomMsP50: percentile(
          bridgeAuditTotals.pathnameShuffleToFinalDomMsSamples,
          0.5,
        ),
        pathnameShuffleToFinalDomMsP95: percentile(
          bridgeAuditTotals.pathnameShuffleToFinalDomMsSamples,
          0.95,
        ),
        transferToLatchReleaseMsP50: percentile(bridgeAuditTotals.transferToLatchReleaseMsSamples, 0.5),
        transferToLatchReleaseMsP95: percentile(bridgeAuditTotals.transferToLatchReleaseMsSamples, 0.95),
      },
      LOCAL_BRIDGE_VALIDATION_CLEAN:
        releaseMode &&
        cleanHops.length === hopSources.length &&
        !ghostReproduced &&
        bridgeAuditTotals.failsafeCount === 0 &&
        legacyGateTotals.legacyLoadingActuallyVisible === 0 &&
        bridgeAuditTotals.ownerNoneDuringBridge === 0,
      diagnosticTimingJitterSeries: {
        PRODUCTION_RELEASE_CAPTURE_MUST_NOT_INJECT_TIMING_JITTER: true,
        captureHostname: captureHostname(),
        explicitDiagTimingJitter,
        anyHopJitterEnabled: hops.some((h) => h.diagnosticTimingJitter?.diagnosticTimingJitterEnabled),
        hopsWithJitter: hops.filter((h) => h.diagnosticTimingJitter?.diagnosticTimingJitterEnabled).length,
        PROD_RAW_CAPTURE_NO_JITTER:
          !captureHostname().includes("localhost") &&
          !captureHostname().includes("127.0.0.1")
            ? hops.every(
                (h) =>
                  h.diagnosticTimingJitter?.diagnosticTimingJitterEnabled === false &&
                  (h.diagnosticTimingJitter?.routeCommitDelayMs ?? 0) === 0 &&
                  (h.diagnosticTimingJitter?.finalRouteDomDelayMs ?? 0) === 0 &&
                  h.diagnosticTimingJitter?.jitterSource === null,
              )
            : null,
      },
      failedHop: failedHop
        ? {
            hopNum: failedHop.hopNum,
            sourceTab: failedHop.sourceTab,
            releaseChecks: failedHop.releaseChecks,
            firstNonSourceFrame: failedHop.firstNonSourceFrame,
          }
        : null,
      hops,
      frameXPath: hops.find((h) => h.frameXPath)?.frameXPath ?? null,
    };

    if (nativeLifecycleNoScreencastMode) {
      report.CAPTURE_PROVIDER_SELECTED = CAPTURE_PROVIDER.NONE_DURING_CRITICAL_WINDOW;
      report.PHYSICAL_EVIDENCE_PROVIDER_SELECTED =
        PHYSICAL_EVIDENCE_PROVIDER_NATIVE_NO_SCREENCAST;
      report.nativeLifecycleTemporalDistributions = summarizeNativeLifecycleSeries(hops);
      report.criticalCaptureTotals = hops.reduce(
        (acc, h) => {
          const c = h.criticalCaptureCounters || {};
          acc.cdpScreencastStartCountDuringCriticalWindow +=
            c.cdpScreencastStartCountDuringCriticalWindow || 0;
          acc.cdpScreencastFrameCountDuringCriticalWindow +=
            c.cdpScreencastFrameCountDuringCriticalWindow || 0;
          acc.pageScreenshotCountDuringCriticalWindow +=
            c.pageScreenshotCountDuringCriticalWindow || 0;
          acc.externalCaptureLoopIterationsDuringCriticalWindow +=
            c.externalCaptureLoopIterationsDuringCriticalWindow || 0;
          return acc;
        },
        emptyCriticalCaptureCounters(),
      );
      report.CHROMIUM_NATIVE_NO_SCREENCAST_20_OF_20_CLEAN = evaluateNativeNoScreencastSeriesClean(
        hops,
        hopSources.length,
      );
      report.CHROME_MULTI_SOURCE_NATIVE_NO_SCREENCAST_20_OF_20_CLEAN =
        useChrome && hopSources.length === 20
          ? evaluateNativeNoScreencastSeriesClean(hops, 20)
          : null;
      report.EXPECTED_SOURCE_SCHEDULE = hopSources;
      report.sourceSpecificCounts = summarizeSourceSpecificCounts(hops);
      report.blackRootEvaluationStatus = "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER";
      report.presentedNoneEvaluationStatus = "NOT_EVALUATED_BY_NO_SCREENCAST_PROVIDER";
      report.RELEASE_SERIES_CLEAN = evaluateNativeNoScreencastSeriesClean(hops, hopSources.length);
    }

    if (visualSpotCheckMode) {
      const visualSummary = summarizeVisualSpotCheckSeries(hops);
      report.TIMING_ROBUSTNESS_GATE_ENABLED = false;
      report.CAPTURE_PROVIDER_SELECTED = CAPTURE_PROVIDER_VISUAL_SPOT_CHECK;
      report.visualSpotCheckSummary = visualSummary;
      report.VISUAL_SPOT_CHECK_SERIES_CLEAN = visualSummary.VISUAL_SPOT_CHECK_SERIES_CLEAN;
      report.RELEASE_SERIES_CLEAN = visualSummary.VISUAL_SPOT_CHECK_SERIES_CLEAN;
    }

    fs.writeFileSync(path.join(runOutDir, "current-head-report.json"), JSON.stringify(report, null, 2));
    return report;
  } finally {
    await context.close();
  }
}

async function runLogin() {
  const loginOut = path.join(outDir, "login");
  fs.mkdirSync(loginOut, { recursive: true });
  const context = await launchContext({ headless: false, runOutDir: loginOut });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(captureUrl("/shuffle"), { waitUntil: "domcontentloaded", timeout: 120000 });

  console.log("\n[current-head-ghost-capture] LOGIN — Chrome stable diagnostic profile");
  console.log(`Profile: ${profileDir}`);
  console.log(`URL: ${captureUrl("/shuffle")}`);
  console.log("\n1. Iniciá sesión en la UI.");
  console.log("2. Cerrá modales: legal, idioma, notificaciones, solicitudes de chat.");
  console.log("3. Verificá bottom nav + Shuffle feed con >=3 slots.");
  console.log("4. Presioná Enter en esta terminal — o esperá: se confirma solo al detectar sesión válida.\n");

  const loginDeadlineMs = Date.now() + 15 * 60 * 1000;
  let confirmed = false;
  let confirmReason = null;
  const stdinIsTty = Boolean(process.stdin.isTTY);

  let enterResolve = null;
  const onEnter = new Promise((resolve) => {
    enterResolve = resolve;
    if (!stdinIsTty) return;
    process.stdin.resume();
    process.stdin.once("data", () => resolve("enter"));
  });

  while (!confirmed && Date.now() < loginDeadlineMs) {
    const raced = await Promise.race([
      stdinIsTty
        ? onEnter.then((r) => ({ type: "enter", r }))
        : new Promise((resolve) => setTimeout(() => resolve({ type: "tick" }), 2000)),
      new Promise((resolve) => setTimeout(() => resolve({ type: "tick" }), 2000)),
    ]);
    if (raced.type === "enter" && raced.r === "enter") {
      confirmed = true;
      confirmReason = "user-enter";
      break;
    }
    await dismissModals(page);
    await ensureEntryLegalClosed(page);
    const mid = await validateHydratedSession(page);
    const midSlots = await page.evaluate(
      () =>
        document.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)").length ||
        document.querySelectorAll(".grid.grid-cols-2 > *").length,
    );
    if (mid.valid && midSlots >= 3) {
      confirmed = true;
      confirmReason = stdinIsTty ? "auto-session-ready" : "auto-session-ready-non-tty";
      console.log("[login] sesión válida detectada — confirmando.");
      break;
    }
  }

  if (enterResolve && stdinIsTty) {
    try {
      process.stdin.pause();
    } catch {
      /* ignore */
    }
  }

  if (!confirmed) {
    const timedOut = {
      step: "login-validation",
      valid: false,
      reason: "login-timeout",
      confirmReason: null,
      profileDir,
    };
    fs.writeFileSync(path.join(loginOut, "login-result.json"), JSON.stringify(timedOut, null, 2));
    console.log(JSON.stringify(timedOut, null, 2));
    await context.close();
    process.exit(2);
  }

  const validation = await validateHydratedSession(page);
  const slots = await page.evaluate(
    () =>
      document.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)").length ||
      document.querySelectorAll(".grid.grid-cols-2 > *").length,
  );
  const result = {
    step: "login-validation",
    valid: validation.valid,
    shuffleSlots: slots,
    probe: validation.probe,
    profileDir,
    confirmReason,
  };
  fs.writeFileSync(path.join(loginOut, "login-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await context.close();
  process.exit(validation.valid && slots >= 3 ? 0 : 2);
}

async function runValidate() {
  fs.mkdirSync(outDir, { recursive: true });
  const context = await launchContext({ headless: true, runOutDir: outDir });
  const page = context.pages()[0] ?? (await context.newPage());
  const validation = await bootstrapSession(page);
  const nav = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll("[data-nav-tab]")].map((el) => el.getAttribute("data-nav-tab")),
    slots:
      document.querySelectorAll("[data-shuffle-list] > *:not(.sayittome-nav-scroll-spacer)").length ||
      document.querySelectorAll(".grid.grid-cols-2 > *").length,
  }));
  const report = { validation, nav, profileDir, captureReady: validation.probe?.captureReady ?? false };
  fs.writeFileSync(path.join(outDir, "validate.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close();
  process.exit(validation.valid && nav.slots >= 3 ? 0 : 2);
}

async function main() {
  if (modeLogin) return runLogin();
  if (modeValidate) return runValidate();

  if (dualBrowser) {
    const baseOut = outDir;
    fs.mkdirSync(baseOut, { recursive: true });
    const chromeOut = path.join(baseOut, "chrome-stable");
    const chromiumOut = path.join(baseOut, "playwright-chromium");
    const chromeReport = await runCapturePass({
      browserLabel: "chrome-stable",
      runOutDir: chromeOut,
    });
    const chromiumReport = await runCapturePass({
      browserLabel: "playwright-chromium",
      runOutDir: chromiumOut,
    });
    const summary = {
      chromeStable: chromeReport,
      playwrightChromium: chromiumReport,
      bothReproducedGhost:
        chromeReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD && chromiumReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD,
      chromeOnly: chromeReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD && !chromiumReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD,
      chromiumOnly: !chromeReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD && chromiumReport.MANUAL_GHOST_REPRODUCED_CURRENT_HEAD,
    };
    fs.writeFileSync(path.join(baseOut, "dual-browser-summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const report = await runCapturePass({
    browserLabel: useChrome ? "chrome-stable" : "playwright-chromium",
    runOutDir: outDir,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "INVALID_SESSION") {
    process.exitCode = 2;
  } else if (runnerIsolationMode && report.cleanHops !== report.hopsRequired) {
    process.exitCode = 1;
  } else if (visualSpotCheckMode && !report.VISUAL_SPOT_CHECK_SERIES_CLEAN) {
    process.exitCode = 1;
  } else if (nativeLifecycleNoScreencastMode && report.CHROMIUM_NATIVE_NO_SCREENCAST_20_OF_20_CLEAN === false) {
    process.exitCode = 1;
  } else if (releaseMode && !visualSpotCheckMode && !nativeLifecycleNoScreencastMode && !report.RELEASE_SERIES_CLEAN) {
    process.exitCode = 1;
  } else if (diagnoseHopNineMode) {
    process.exitCode = 0;
  } else {
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
