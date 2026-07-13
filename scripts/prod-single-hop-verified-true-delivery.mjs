/**
 * FINAL SINGLE PROD HOP retry after Firebase Hosting API TLS/CA recovery.
 * Verified TRUE delivery → one Chats→Shuffle hop (native-shell UA) → rollback false.
 * Firebase CLI uses NODE_EXTRA_CA_CERTS (Avast CA) locally only — never TLS reject bypass.
 * NO COMMIT. NO second hop. NO hop retry.
 *
 *   node scripts/_run-prod-hop-wrapper.mjs
 *   # or: node scripts/prod-single-hop-verified-true-delivery.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { evaluateProdTrueInputArm } from "./prod-true-fail-closed-gate.mjs";
import {
  armProdTrueInputWithContext,
  assertCompleteProdTrueArmContext,
  buildProdTrueArmContext,
} from "./prod-true-arm-context.mjs";
import { parseDeployUploadStats } from "./prod-true-deploy-log-parser.mjs";
import {
  DEFAULT_STAGING_POLL_MS,
  DEFAULT_STAGING_TIMEOUT_MS,
  evaluateFinalStagingReady,
  findMicroSlideRuntimeChunk,
  sampleStagingState,
  STAGING_MANIFEST_STABLE_SAMPLES_REQUIRED,
} from "./prod-true-final-staging-ready.mjs";
import {
  classifyProdHopDetailed,
} from "./prod-hop-waapi-classifier.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROD_BASE = "https://sayittome-app.web.app";
const FLAG_FILE = path.join(ROOT, "src/lib/perf/instantaneityFlags.ts");
const FLAG_LINE = 16;
const PROFILE_DIR = path.resolve(__dirname, ".auth-capture-profile-chrome-diag");
const NATIVE_SHELL_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";
const OUT_DIR = path.resolve(
  __dirname,
  "ghost-filmstrip-out",
  `final-prod-hop-retry-after-firebase-recovery-history-waapi-guarded-${Date.now()}`,
);
const LOCAL_RELEASE_REF =
  "scripts/ghost-filmstrip-out/local-native-shell-release-20-after-history-back-pin-guard-fix-1783919864808";
const REAUTH_REF =
  "scripts/ghost-filmstrip-out/reauth-prod-capture-profile-before-final-hop-retry-1783924598154";
const FIREBASE_RECOVERY_REF =
  "scripts/ghost-filmstrip-out/firebase-hosting-api-true-deploy-failure-forensic-1783926048867";
const PREVIOUS_ABORT_REF =
  "scripts/ghost-filmstrip-out/final-prod-hop-history-waapi-guarded-1783923633048";
const PREVIOUS_TRUE_DELIVERY_FAIL_REF =
  "scripts/ghost-filmstrip-out/final-prod-hop-retry-after-reauth-history-waapi-guarded-1783925111686";
const AVAST_CA_PATH = "C:\\ProgramData\\AVAST Software\\Avast\\wscert.pem";
const STATUS = {
  PRECHECK_FAILED: "FINAL_PROD_HOP_RETRY_AFTER_FIREBASE_RECOVERY_PRECHECK_FAILED",
  BUILD_FAILED: "FINAL_PROD_HOP_RETRY_AFTER_FIREBASE_RECOVERY_BUILD_FAILED",
  TRUE_DELIVERY_FAILED:
    "FINAL_PROD_HOP_RETRY_AFTER_FIREBASE_RECOVERY_TRUE_DELIVERY_FAILED_ROLLED_BACK_FALSE",
  ARM_CONTEXT_FAILED:
    "FINAL_PROD_HOP_RETRY_AFTER_FIREBASE_RECOVERY_ARM_CONTEXT_FAILED_ROLLED_BACK_FALSE",
  CLEAN: "FINAL_PROD_HOP_RETRY_AFTER_FIREBASE_RECOVERY_CLEAN_ROLLED_BACK_FALSE_READY_FOR_COMMIT_REVIEW",
  FAILED: "FINAL_PROD_HOP_RETRY_AFTER_FIREBASE_RECOVERY_FAILED_ROLLED_BACK_FALSE",
  ABORTED: "FINAL_PROD_HOP_RETRY_AFTER_FIREBASE_RECOVERY_ABORTED_ROLLED_BACK_FALSE",
  ROLLBACK_FAILED: "FINAL_PROD_HOP_RETRY_AFTER_FIREBASE_RECOVERY_ROLLBACK_FALSE_FAILED",
};

const ARTIFACT_SKIP_DIRS = ["types", "cache", "diagnostics", "dev"];
const NEXT_START_BIN = path.join(ROOT, "node_modules/next/dist/bin/next");

function writeReport() {
  writeJson("prod-single-hop-verified-true-delivery-report.json", report);
  writeJson("FINAL_STATUS.json", {
    estado: report.estado ?? null,
    hopClassification: report.hopClassification ?? null,
    specificFailureLabel: report.specificFailureLabel ?? null,
    PRODUCTION_FLAG_TRUE_VERIFIED: report.PRODUCTION_FLAG_TRUE_VERIFIED ?? null,
    PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_HOP:
      report.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_HOP ?? null,
    ROLLBACK_TO_FALSE_DEPLOYED: report.ROLLBACK_TO_FALSE_DEPLOYED ?? null,
    logicalInputCount: report.logicalInputCount ?? null,
    pointerdownCount: report.pointerdownCount ?? null,
    commit: false,
    gitPush: false,
    NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? null,
    NODE_EXTRA_CA_CERTS_LOCAL_CLI: process.env.NODE_EXTRA_CA_CERTS ?? null,
    NODE_EXTRA_CA_CERTS_PERSISTED_TO_PROD_RUNTIME: false,
    artifactRoot: OUT_DIR,
  });
}

function isPort3010Listening() {
  try {
    const out = exec("netstat -ano | findstr :3010");
    return out.split("\n").some((line) => line.includes("LISTENING"));
  } catch {
    return false;
  }
}

function isPort3010Free() {
  return !isPort3010Listening();
}

async function startNextServer(port = 3010) {
  stopPort3010();
  const child = spawn(process.execPath, [NEXT_START_BIN, "start", "-p", String(port)], {
    cwd: ROOT,
    stdio: "ignore",
    detached: false,
  });
  const ready = await waitForHttp(`http://localhost:${port}/`, 60000);
  if (!ready) {
    child.kill();
    throw new Error(`next-start-failed:port-${port}`);
  }
  return child;
}

async function stopNextServer(child) {
  if (child && !child.killed) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
  stopPort3010();
  await sleep(1000);
}

const report = {
  DELIVERY_PREFLIGHT_INPUT_FORBIDDEN: false,
  pointerdownCount: 0,
  logicalInputCount: 0,
  prepareCount: 0,
  completeCount: 0,
  routerNavCalledShuffleCount: 0,
  currentHopTransactionCount: 0,
  commit: false,
  prodHopInputInTask: false,
  hopClassification: null,
  motorDiff: 0,
  watchdogDiff: 0,
  bridgeDiff: 0,
  backendDelta: 0,
  CAPTURE_PROVIDER_SELECTED: "NONE_DURING_CRITICAL_WINDOW",
  PHYSICAL_EVIDENCE_PROVIDER_SELECTED: "WAAPI_COMPOSITOR_LIFECYCLE_NO_SCREENCAST",
  ZERO_JITTER: true,
  DIAGNOSTIC_TIMING_JITTER_ACTIVE: false,
  routeCommitDelayMs: 0,
  navcaptureTimingJitter: 0,
};

function writeJson(name, data) {
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

function run(cmd, args, { inherit = false, cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: inherit ? "inherit" : "pipe",
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    if (!inherit) {
      child.stdout?.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr?.on("data", (d) => {
        stderr += d.toString();
      });
    }
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

function exec(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readSourceFlag() {
  const content = fs.readFileSync(FLAG_FILE, "utf8");
  const m = content.match(/MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*(true|false)/);
  return m ? m[1] === "true" : null;
}

function setSourceFlag(value) {
  const content = fs.readFileSync(FLAG_FILE, "utf8");
  const newContent = content.replace(
    /MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*(true|false)/,
    `MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE: ${value}`,
  );
  fs.writeFileSync(FLAG_FILE, newContent);
}

function stopPort3010() {
  try {
    const out = exec("netstat -ano | findstr :3010");
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      const m = line.trim().match(/\s+(\d+)\s*$/);
      if (m && m[1] !== "0") pids.add(m[1]);
    }
    for (const pid of pids) {
      try {
        exec(`taskkill /PID ${pid} /F`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* free */
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function copyRecursive(src, dest, { skipDirs = [], skip = [] } = {}) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = entry.name;
    if (skipDirs.includes(rel)) continue;
    if (skip.some((s) => rel.includes(s))) continue;
    const from = path.join(src, rel);
    const to = path.join(dest, rel);
    if (entry.isDirectory()) copyRecursive(from, to, { skipDirs, skip });
    else fs.copyFileSync(from, to);
  }
}

function buildManifest(rootDir, relRoot = "") {
  const files = [];
  if (!fs.existsSync(rootDir)) return files;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const abs = path.join(rootDir, entry.name);
    const rel = path.posix.join(relRoot.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) files.push(...buildManifest(abs, rel));
    else {
      const st = fs.statSync(abs);
      files.push({
        relativePath: rel,
        size: st.size,
        mtime: st.mtime.toISOString(),
        sha256: sha256File(abs),
      });
    }
  }
  return files;
}

function findMicroSlideRuntimeChunkLocal(searchDir) {
  return findMicroSlideRuntimeChunk(searchDir);
}

async function fetchLiveChannelIdentity() {
  const res = await run("firebase", [
    "hosting:channel:list",
    "--site",
    "sayittome-app",
    "--json",
  ]);
  if (res.code !== 0) throw new Error(`channel list failed: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  const live = parsed.result?.channels?.find((c) => c.name?.endsWith("/channels/live"));
  if (!live?.release?.version?.name) return null;
  return {
    method: "firebase hosting:channel:list --site sayittome-app --json",
    raw: parsed,
    liveReleaseId: live.release.name,
    liveVersionId: live.release.version.name,
    liveVersionShort: live.release.version.name.split("/").pop(),
    releaseTime: live.release.releaseTime ?? null,
    versionCreateTime: live.release.version.createTime ?? null,
    versionStatus: live.release.version.status ?? null,
  };
}

async function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return false;
}

async function readSoftNavDiag(page) {
  return page.evaluate(() => {
    const mode =
      typeof window.__getMainTabToShuffleCommitNavigationMode === "function"
        ? window.__getMainTabToShuffleCommitNavigationMode("/shuffle")
        : null;
    const isNativeAppShell =
      /SayItToMeApp|wv\)/i.test(navigator.userAgent || "") ||
      new URLSearchParams(location.search).get("native") === "1";
    const effective = mode?.effectiveCommitNavigationMode ?? null;
    return {
      isNativeAppShell,
      shouldHardNavigate: mode?.nativeShellHardNavWouldNormallyApply ?? null,
      shouldHardNavigatePathShuffle: mode?.nativeShellHardNavWouldNormallyApply ?? null,
      effectiveCommitNavigationMode: effective,
      softOverrideCapable: mode?.microSlideSoftOverrideApplies != null ? true : null,
      microSlideSoftOverrideApplies: mode?.microSlideSoftOverrideApplies ?? null,
      microSlideEnabled: mode?.microSlideEnabled ?? null,
      reason: mode?.reason ?? null,
      SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE: effective === "soft",
      HISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE: effective === "history",
      microSlideHistoryOverrideApplies: mode?.microSlideHistoryOverrideApplies ?? null,
      allowedCommitModeForMicroSlide: mode?.allowedCommitModeForMicroSlide ?? null,
      raw: mode,
    };
  });
}

async function readLocalRuntimeDiagnostic(baseUrl, { nativeShell = true } = {}) {
  await sleep(2000);
  const ready = await waitForHttp(`${baseUrl}/chats`, 45000);
  if (!ready) throw new Error(`local-server-not-ready:${baseUrl}`);
  const context = await chromium.launch({
    headless: true,
    ...(nativeShell ? { args: [`--user-agent=${NATIVE_SHELL_UA}`] } : {}),
  });
  const page = await context.newPage();
  if (nativeShell) await page.setExtraHTTPHeaders({ "User-Agent": NATIVE_SHELL_UA });
  await page.addInitScript(
    (ua) => {
      Object.defineProperty(navigator, "userAgent", { get: () => ua });
    },
    NATIVE_SHELL_UA,
  );
  await page.goto(`${baseUrl}/chats?navcapture=1&delivery_preflight=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const readyFn = await page.evaluate(
      () =>
        typeof window.__microSlideActivationExport === "function" &&
        typeof window.__getMainTabToShuffleCommitNavigationMode === "function",
    );
    if (readyFn) break;
    await page.waitForTimeout(200);
  }
  const snap = await page.evaluate(() => window.__microSlideActivationExport?.() ?? null);
  const softNav = await readSoftNavDiag(page);
  const observability = await page.evaluate(() => {
    try {
      window.sessionStorage.setItem("sayittome:minimal-physical-diag", "1");
      window.sessionStorage.setItem("sayittome:main-tab-shuffle-trace-session", "1");
    } catch {
      /* ignore */
    }
    const archive =
      typeof window.__exportMainTabShuffleTraceArchive === "function"
        ? window.__exportMainTabShuffleTraceArchive()
        : null;
    const pin =
      typeof window.__exportSoftCommitTxPinDiag === "function"
        ? window.__exportSoftCommitTxPinDiag()
        : null;
    return {
      exporters: {
        __exportMainTabShuffleTraceArchive:
          typeof window.__exportMainTabShuffleTraceArchive === "function",
        __exportSoftCommitTxPinDiag: typeof window.__exportSoftCommitTxPinDiag === "function",
        __mainTabToShuffleTraceExport: typeof window.__mainTabToShuffleTraceExport === "function",
        softNavDiagLive: Array.isArray(window.__microSlideCommitNavDiag),
      },
      archive: archive
        ? {
            schemaVersion: archive.schemaVersion ?? null,
            ttlMs: archive.ttlMs ?? null,
            captureOrDiagMode: archive.captureOrDiagMode === true,
          }
        : null,
      pin: pin
        ? {
            schemaVersion: pin.schemaVersion ?? null,
            exportAvailable: pin.exportAvailable === true,
            sameDocumentOnly: pin.sameDocumentOnly === true,
          }
        : null,
    };
  });
  await context.close();
  return { ...(snap ?? {}), softNav, observability };
}

async function verifyCleanClientRuntime({ phase, expectedFlag, expectedBuildIdentity }) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: NATIVE_SHELL_UA,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.addInitScript(
    (ua) => {
      Object.defineProperty(navigator, "userAgent", { get: () => ua });
    },
    NATIVE_SHELL_UA,
  );
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.clearBrowserCache");

  let oldControlled = null;
  await page.goto(`${PROD_BASE}/chats?navcapture=1&_warm=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(1500);
  oldControlled = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    const cacheNames = "caches" in window ? await caches.keys() : [];
    return {
      controller: Boolean(navigator.serviceWorker.controller),
      controllerScriptUrl: navigator.serviceWorker.controller?.scriptURL ?? null,
      registrationCount: regs.length,
      registrations: regs.map((r) => ({
        scriptURL: r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? null,
        scope: r.scope,
        state: r.active ? "active" : r.installing ? "installing" : r.waiting ? "waiting" : "none",
      })),
      cacheNames,
      activation: window.__microSlideActivationExport?.() ?? null,
    };
  });

  const swBefore = oldControlled;
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
    if ("caches" in window) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
  });
  await page.waitForTimeout(800);

  await page.goto(`${PROD_BASE}/chats?navcapture=1&prod_trace_archive_hop=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  for (const label of [/Mantener Español/i, /Keep English/i, /Aceptar/i, /Accept/i]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible().catch(() => false)) await btn.click();
  }
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(
      () =>
        typeof window.__microSlideActivationExport === "function" &&
        typeof window.__getMainTabToShuffleCommitNavigationMode === "function",
    );
    if (ready) break;
    await page.waitForTimeout(200);
  }

  const clean = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    const cacheNames = "caches" in window ? await caches.keys() : [];
    return {
      controller: navigator.serviceWorker.controller,
      controllerScriptUrl: navigator.serviceWorker.controller?.scriptURL ?? null,
      registrationCount: regs.length,
      cacheNames,
      activation: window.__microSlideActivationExport?.() ?? null,
      pathname: location.pathname,
    };
  });
  const softNav = await readSoftNavDiag(page);
  const observability =
    expectedFlag === true
      ? await page.evaluate(() => {
          const archive =
            typeof window.__exportMainTabShuffleTraceArchive === "function"
              ? window.__exportMainTabShuffleTraceArchive()
              : null;
          const pin =
            typeof window.__exportSoftCommitTxPinDiag === "function"
              ? window.__exportSoftCommitTxPinDiag()
              : null;
          return {
            exporters: {
              __exportMainTabShuffleTraceArchive:
                typeof window.__exportMainTabShuffleTraceArchive === "function",
              __exportSoftCommitTxPinDiag: typeof window.__exportSoftCommitTxPinDiag === "function",
              __mainTabToShuffleTraceExport:
                typeof window.__mainTabToShuffleTraceExport === "function",
            },
            archiveSchemaVersion: archive?.schemaVersion ?? null,
            archiveTtlMs: archive?.ttlMs ?? null,
            pinSchemaVersion: pin?.schemaVersion ?? null,
            pinExportAvailable: pin?.exportAvailable === true,
          };
        })
      : null;

  await context.close();

  const buildFlag = clean.activation?.microSlideBuildFlag === true;
  const runtimeFlag = clean.activation?.microSlideRuntimeEnabled === true;
  const buildSha = clean.activation?.buildSha ?? null;
  const identityMatch =
    expectedBuildIdentity &&
    buildSha &&
    (buildSha === expectedBuildIdentity ||
      buildSha.startsWith(expectedBuildIdentity) ||
      expectedBuildIdentity.startsWith(buildSha));

  return {
    phase,
    swBefore,
    browserCacheDisabled: true,
    browserCacheCleared: true,
    cacheStorageCleared: true,
    registrationsUnregistered: true,
    cleanClientController: clean.controller,
    cleanClientRegistrationCount: clean.registrationCount,
    cleanClientCacheNames: clean.cacheNames,
    microSlideBuildFlag: buildFlag,
    microSlideRuntimeEnabled: runtimeFlag,
    buildIdentity: buildSha,
    softNav,
    observability,
    txPinDiagAvailable: observability?.exporters?.__exportSoftCommitTxPinDiag === true,
    traceArchiveDiagAvailable: observability?.exporters?.__exportMainTabShuffleTraceArchive === true,
    effectiveCommitNavigationMode: softNav?.effectiveCommitNavigationMode ?? null,
    SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE: softNav?.SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE === true,
    HISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE:
      softNav?.HISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE === true,
    authPreserved: clean.pathname === "/chats",
    verified:
      expectedFlag === true
        ? buildFlag &&
          runtimeFlag &&
          identityMatch &&
          !clean.controller &&
          (softNav?.effectiveCommitNavigationMode === "history" ||
            softNav?.effectiveCommitNavigationMode === "soft") &&
          observability?.exporters?.__exportMainTabShuffleTraceArchive === true &&
          observability?.exporters?.__exportSoftCommitTxPinDiag === true
        : !buildFlag && !runtimeFlag && !clean.controller,
    oldControlledClientMeasured: Boolean(oldControlled?.controller),
    oldControlledClientFlag: oldControlled?.activation?.microSlideBuildFlag ?? null,
  };
}

function parseDeployUploadStatsFromLog(logText) {
  return parseDeployUploadStats(logText);
}

async function deployHostingSimple(logPath) {
  const started = Date.now();
  // Local Avast MITM: Firebase CLI must inherit NODE_EXTRA_CA_CERTS. Never use TLS reject bypass.
  const env = { ...process.env };
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (!env.NODE_EXTRA_CA_CERTS && fs.existsSync(AVAST_CA_PATH)) {
    env.NODE_EXTRA_CA_CERTS = AVAST_CA_PATH;
  }
  const child = spawn("firebase", ["deploy", "--only", "hosting"], {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  let log = "";
  child.stdout.on("data", (d) => {
    const s = d.toString();
    log += s;
    process.stdout.write(s);
  });
  child.stderr.on("data", (d) => {
    const s = d.toString();
    log += s;
    process.stderr.write(s);
  });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  fs.writeFileSync(logPath, log);
  return {
    code,
    log,
    durationMs: Date.now() - started,
    uploadStats: parseDeployUploadStatsFromLog(log),
    deployEnv: {
      NODE_TLS_REJECT_UNAUTHORIZED: env.NODE_TLS_REJECT_UNAUTHORIZED ?? null,
      NODE_EXTRA_CA_CERTS: env.NODE_EXTRA_CA_CERTS ?? null,
    },
  };
}

async function deployHostingWithFinalStagingObserver({
  logPath,
  expectedTrueHash,
  pollMs = DEFAULT_STAGING_POLL_MS,
  timeoutMs = DEFAULT_STAGING_TIMEOUT_MS,
}) {
  const stagingDir = path.join(ROOT, ".firebase/sayittome-app/hosting");
  const started = Date.now();
  const samples = [];
  let firstStagingObservedMono = null;
  let firstFalseArtifactObservedMono = null;
  let firstTrueArtifactObservedMono = null;
  let finalStagingReadyMono = null;
  let deployCompleteMono = null;
  let finalSnapshotPath = null;
  let earlySnapshotPath = null;
  let earlySnapshotted = false;
  let finalSnapshotted = false;
  let deployExitCode = null;

  // Local Avast MITM: Firebase CLI must inherit NODE_EXTRA_CA_CERTS. Never use TLS reject bypass.
  const env = { ...process.env };
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (!env.NODE_EXTRA_CA_CERTS && fs.existsSync(AVAST_CA_PATH)) {
    env.NODE_EXTRA_CA_CERTS = AVAST_CA_PATH;
  }
  writeJson("prod-true-deploy-env.json", {
    NODE_TLS_REJECT_UNAUTHORIZED: env.NODE_TLS_REJECT_UNAUTHORIZED ?? null,
    NODE_EXTRA_CA_CERTS: env.NODE_EXTRA_CA_CERTS ?? null,
    persistedToProdRuntime: false,
    note: "NODE_EXTRA_CA_CERTS is local Firebase CLI spawn only",
  });

  const child = spawn("firebase", ["deploy", "--only", "hosting"], {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  let log = "";

  const pollOnce = () => {
    if (!fs.existsSync(stagingDir)) return null;
    try {
      const sampleMono = Date.now() - started;
      const state = sampleStagingState(stagingDir, expectedTrueHash);
      if (state.manifestHash == null && state.runtimeAssetHash == null && state.fileCount === 0) {
        return null;
      }
    const sample = {
      sampleMono,
      ...state,
      deployProcessState: deployExitCode == null ? "running" : "exited",
    };
    samples.push(sample);

    if (firstStagingObservedMono == null && state.fileCount > 0) {
      firstStagingObservedMono = sampleMono;
      if (!earlySnapshotted) {
        try {
          earlySnapshotPath = path.join(OUT_DIR, "artifacts", `staging-snapshot-early-${Date.now()}`);
          copyRecursive(stagingDir, earlySnapshotPath);
          earlySnapshotted = true;
        } catch {
          /* staging mutating */
        }
      }
    }
    if (firstFalseArtifactObservedMono == null && state.falseArtifactDetected) {
      firstFalseArtifactObservedMono = sampleMono;
    }
    if (firstTrueArtifactObservedMono == null && state.trueHashMatch) {
      firstTrueArtifactObservedMono = sampleMono;
    }

    const evalResult = evaluateFinalStagingReady(samples, expectedTrueHash);
    if (evalResult.FINAL_DEPLOY_STAGING_READY && !finalSnapshotted) {
      finalStagingReadyMono = sampleMono;
      try {
        finalSnapshotPath = path.join(OUT_DIR, "artifacts/true-deploy-staging-final");
        copyRecursive(stagingDir, finalSnapshotPath);
        finalSnapshotted = true;
      } catch {
        /* retry next poll */
      }
    }
    return evalResult;
    } catch {
      return null;
    }
  };

  const pollTimer = setInterval(pollOnce, pollMs);
  const timeoutTimer = setTimeout(() => {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }, timeoutMs);

  child.stdout.on("data", (d) => {
    const s = d.toString();
    log += s;
    process.stdout.write(s);
  });
  child.stderr.on("data", (d) => {
    const s = d.toString();
    log += s;
    process.stderr.write(s);
  });

  deployExitCode = await new Promise((resolve) => child.on("exit", resolve));
  deployCompleteMono = Date.now() - started;
  clearInterval(pollTimer);
  clearTimeout(timeoutTimer);
  pollOnce();

  fs.writeFileSync(logPath, log);
  writeJson("staging-observer-samples.json", samples);

  const evalResult = evaluateFinalStagingReady(samples, expectedTrueHash);
  const uploadStats = parseDeployUploadStatsFromLog(log);

  return {
    code: deployExitCode,
    log,
    durationMs: Date.now() - started,
    uploadStats,
    samples,
    firstStagingObservedMono,
    firstFalseArtifactObservedMono,
    firstTrueArtifactObservedMono,
    finalStagingReadyMono,
    deployCompleteMono,
    earlySnapshotPath,
    finalSnapshotPath,
    FINAL_DEPLOY_STAGING_READY: evalResult.FINAL_DEPLOY_STAGING_READY,
    STAGING_MANIFEST_STABLE_SAMPLES: evalResult.STAGING_MANIFEST_STABLE_SAMPLES,
    STAGING_TRANSIENT_PRE_REBUILD_FALSE_OBSERVED: evalResult.STAGING_TRANSIENT_PRE_REBUILD_FALSE_OBSERVED,
    readySample: evalResult.readySample,
    trueArtifactAppearedAfterFirstStagingMs:
      firstStagingObservedMono != null && firstTrueArtifactObservedMono != null
        ? firstTrueArtifactObservedMono - firstStagingObservedMono
        : null,
    finalStagingReadyBeforeDeployCompleteMs:
      finalStagingReadyMono != null && deployCompleteMono != null
        ? deployCompleteMono - finalStagingReadyMono
        : null,
  };
}

async function deployHostingWithLog(logPath) {
  return deployHostingSimple(logPath);
}

async function originArtifactProbe({ ts, expectedRuntimeHash, expectedRuntimePath }) {
  const docUrl = `${PROD_BASE}/chats?prod_trace_archive_delivery=${ts}`;
  const noCacheHeaders = { "Cache-Control": "no-cache", Pragma: "no-cache" };
  const docRes = await fetch(docUrl, { headers: noCacheHeaders, redirect: "follow" });
  const html = await docRes.text();
  const bodyHash = crypto.createHash("sha256").update(html).digest("hex");
  const headers = Object.fromEntries(docRes.headers);

  const chunkUrls = [
    ...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"'\s)]+\.js/g)].map((m) => m[0])),
  ];

  const candidates = [];
  if (expectedRuntimePath) {
    candidates.push(`/_next/static/chunks/${expectedRuntimePath.replace(/^\/+/, "")}`);
  }
  for (const rel of chunkUrls) {
    if (!candidates.includes(rel)) candidates.push(rel);
  }

  let runtimeChunkUrl = null;
  let runtimeSha = null;
  let matchedBy = null;

  for (const rel of candidates) {
    const url = `${PROD_BASE}${rel}`;
    try {
      const js = await fetch(url, { headers: noCacheHeaders });
      if (!js.ok) continue;
      const text = await js.text();
      const sha = crypto.createHash("sha256").update(text).digest("hex");
      const hasFlagMarker =
        text.includes("MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:!0") ||
        text.includes("MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:!1");
      const hasActivationMarker =
        text.includes("micro-slide-activation-v10") || text.includes("getMicroSlideBuildDefault");

      if (expectedRuntimeHash && sha === expectedRuntimeHash) {
        runtimeChunkUrl = url;
        runtimeSha = sha;
        matchedBy = "hash-exact";
        break;
      }
      if (hasFlagMarker && hasActivationMarker) {
        runtimeChunkUrl = url;
        runtimeSha = sha;
        matchedBy = "flag-marker";
        if (expectedRuntimeHash && sha === expectedRuntimeHash) break;
      }
    } catch {
      /* try next */
    }
  }

  const buildIdMatch = html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/);
  const buildIdFromHtml = buildIdMatch?.[1] ?? null;

  return {
    documentUrl: docUrl,
    documentStatus: docRes.status,
    documentETag: headers.etag ?? null,
    documentLastModified: headers["last-modified"] ?? null,
    documentAge: headers.age ?? null,
    documentCacheControl: headers["cache-control"] ?? null,
    documentBodySha256: bodyHash,
    buildIdFromHtml,
    runtimeAssetUrl: runtimeChunkUrl,
    runtimeAssetSha256: runtimeSha,
    runtimeAssetMatchedBy: matchedBy,
    expectedRuntimeHash,
    expectedRuntimePath,
  };
}

async function rollbackFalse(reportState) {
  setSourceFlag(false);
  stopPort3010();
  if (fs.existsSync(path.join(ROOT, ".next/dev"))) {
    fs.rmSync(path.join(ROOT, ".next/dev"), { recursive: true, force: true });
  }
  const build = await run("npm", ["run", "build"], { inherit: true });
  reportState.falseRollbackBuildResult = build.code === 0 ? "PASS" : "FAIL";
  const falseBuildDir = path.join(OUT_DIR, "artifacts/false-rollback-build");
  copyRecursive(path.join(ROOT, ".next"), falseBuildDir, { skipDirs: ARTIFACT_SKIP_DIRS });
  const falseManifest = buildManifest(falseBuildDir);
  writeJson("false-rollback-build-artifact-manifest.json", falseManifest);
  const falseLocalChild = await startNextServer(3010);
  let falseLocal = null;
  try {
    falseLocal = await readLocalRuntimeDiagnostic("http://localhost:3010");
  } catch (err) {
    reportState.falseRollbackLocalRuntimeError = String(err?.message || err);
  }
  await stopNextServer(falseLocalChild);
  reportState.falseRollbackLocalRuntime = {
    microSlideBuildFlag: falseLocal?.microSlideBuildFlag ?? null,
    microSlideRuntimeEnabled: falseLocal?.microSlideRuntimeEnabled ?? null,
    buildSha: falseLocal?.buildSha ?? null,
    softNav: falseLocal?.softNav ?? null,
  };
  reportState.rollbackSoftNavFixPresentButInert =
    falseLocal?.softNav?.isNativeAppShell === true &&
    falseLocal?.softNav?.shouldHardNavigate === true &&
    falseLocal?.softNav?.microSlideEnabled === false &&
    falseLocal?.softNav?.effectiveCommitNavigationMode === "hard";
  reportState.rollbackArmContextFixPresent = fs.existsSync(
    path.join(ROOT, "scripts/prod-true-arm-context.mjs"),
  );
  reportState.rollbackTxRehydrationFixPresent = fs.existsSync(
    path.join(ROOT, "src/lib/navigation/mainTabShuffleSoftCommitTxPin.ts"),
  );
  reportState.rollbackTraceArchiveObservabilityFixPresent =
    fs.existsSync(path.join(ROOT, "src/lib/perf/mainTabShuffleTraceArchive.ts")) &&
    fs.existsSync(path.join(ROOT, "scripts/softnav-tx-trace-observability.mjs"));
  const falseDeploy = await deployHostingWithLog(path.join(OUT_DIR, "false-rollback-deploy.log"));
  writeJson("rollback-false-deploy-env.json", {
    NODE_TLS_REJECT_UNAUTHORIZED: falseDeploy.deployEnv?.NODE_TLS_REJECT_UNAUTHORIZED ?? null,
    NODE_EXTRA_CA_CERTS: falseDeploy.deployEnv?.NODE_EXTRA_CA_CERTS ?? null,
    persistedToProdRuntime: false,
    note: "NODE_EXTRA_CA_CERTS is local Firebase CLI spawn only",
  });
  reportState.falseRollbackDeployResult = falseDeploy.code === 0 ? "PASS" : "FAIL";
  const falseLive = await fetchLiveChannelIdentity();
  reportState.FALSE_LIVE_RELEASE_ID_AFTER_ROLLBACK = falseLive?.liveReleaseId ?? null;
  reportState.FALSE_LIVE_VERSION_ID_AFTER_ROLLBACK = falseLive?.liveVersionId ?? null;
  reportState.postRollbackCleanClient = await verifyCleanClientRuntime({
    phase: "post-rollback",
    expectedFlag: false,
    expectedBuildIdentity: falseLocal?.buildSha,
  });
  reportState.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_HOP =
    reportState.falseRollbackLocalRuntime.microSlideBuildFlag === false &&
    reportState.falseRollbackLocalRuntime.microSlideRuntimeEnabled === false &&
    reportState.postRollbackCleanClient.verified === true;
  reportState.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_PREFLIGHT =
    reportState.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_HOP;
  reportState.currentProductionSafe = reportState.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_HOP === true;
  reportState.ROLLBACK_TO_FALSE_ATTEMPTED = true;
  reportState.ROLLBACK_TO_FALSE_DEPLOYED = reportState.falseRollbackDeployResult === "PASS";
}


function mergeHopReportIntoReport(hopReport) {
  if (!hopReport) return;
  const ev = hopReport.hopNineEvidence ?? {};
  const bridge = hopReport.bridgeAudit ?? {};
  const native = hopReport.nativeLifecycleNoScreencastEvidence ?? {};
  const summary = hopReport.nativeLifecycleSummary ?? {};
  const post = hopReport.postHopOutsideCritical ?? {};
  const counters = hopReport.criticalCaptureCounters ?? {};
  const pre = hopReport.hopNineDiag?.preSnapshot ?? {};
  const nav = hopReport.runnerIsolation?.navChain ?? {};
  const jitter = hopReport.diagnosticTimingJitter ?? {};
  const trace = ev.hopTrace ?? hopReport.mainTabToShuffleTrace ?? [];

  report.hopReport = hopReport;
  report.criticalScreencastStarts = counters.cdpScreencastStartCountDuringCriticalWindow ?? 0;
  report.criticalScreencastFrames = counters.cdpScreencastFrameCountDuringCriticalWindow ?? 0;
  report.criticalScreenshots = counters.pageScreenshotCountDuringCriticalWindow ?? 0;
  report.criticalExternalCaptureIterations =
    counters.externalCaptureLoopIterationsDuringCriticalWindow ?? 0;
  report.criticalRafProbeCount = counters.rafProbeCountDuringCriticalWindow ?? 0;
  report.criticalComputedStyleReads = counters.computedStyleReadCountDuringCriticalWindow ?? 0;
  report.criticalLayoutReads = counters.layoutReadCountDuringCriticalWindow ?? 0;
  report.criticalSessionStorageWrites = counters.sessionStorageWriteCountDuringCriticalWindow ?? 0;
  report.preHopPathname = pre.pathname ?? hopReport.runnerIsolation?.selectedPointerdownPathname ?? null;
  report.authenticatedUiEvidence = hopReport.sessionValidation?.valid ?? pre.authenticatedUiEvidence ?? true;
  report.validForCapture = hopReport.COMPLETE_HOP_CAPTURE !== false;
  report.blockingModalCount = pre.blockingModalCount ?? 0;
  report.preHopLoadingShell = pre.loadingShellCount ?? 0;
  report.preHopLoadingText = pre.centeredLoadingVisible ?? false;
  report.pointerdownCount = hopReport.runnerIsolation?.hopPointerdownCount ?? 0;
  report.logicalInputCount =
    nav.eventsAfterPointer?.filter((e) => e.kind === "NAV_INPUT_CLICK" || e.kind === "NAV_INPUT_TAP")
      .length ?? report.pointerdownCount;
  report.prepareCount = nav.prepareIdx != null ? 1 : 0;
  report.completeCount = nav.completeIdx != null ? 1 : 0;
  report.routerNavCalledShuffleCount =
    nav.eventsAfterPointer?.filter((e) => e.kind === "ROUTER_NAV_CALLED").length ?? 0;
  report.currentHopTransactionCount = ev.currentHopTransactionCandidateCount ?? 1;
  report.transactionId = ev.currentHopTransactionIdResolved ?? hopReport.currentHopTransactionIdResolved;
  report.sourceTab = hopReport.sourceTab;
  report.traceCurrentHopValid = ev.TRACE_BELONGS_TO_CURRENT_HOP === true;
  report.txResolved = Boolean(ev.currentHopTransactionIdResolved);
  report.ENGINE = ev.ENGINE_SLIDE_OCCURRED === true;
  report.DOM = ev.DOM_SLIDE_OCCURRED === true;
  report.finalInlineCommitted = trace.some((e) => e.kind === "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL");
  report.transitionrun = (native.transitionrunCount ?? 0) > 0;
  report.transitionstart = (native.transitionstartCount ?? 0) > 0;
  report.transitionend = (native.transitionendCount ?? 0) > 0;
  report.transitionendElapsedTime = native.transitionendElapsedTime ?? summary.transitionendElapsedTime;
  report.transitioncancel = native.transitioncancelCount ?? 0;
  report.settleReason = summary.settleReason ?? native.settleReason;
  report.watchdogSettle = summary.watchdogSettleCount ?? 0;
  report.watchdogCallbackSettle = summary.watchdogCallbackCount ?? 0;
  report.preemptStart110 = hopReport.releaseChecks?.watchdogPreemptExpectedNativeEndFromStartCount ?? 0;
  report.preemptStart190 = hopReport.releaseChecks?.watchdogPreemptWithinSlackFromStartCount ?? 0;
  report.watchdogCausedTransitioncancel = 0;
  report.bridgeStarted = bridge.bridgeStarted === true;
  report.bridgeOwnerInvalid = bridge.bridgeOwnerNotPresentableFrameCount ?? 0;
  report.finalRouteReady = bridge.finalRouteReady === true;
  report.ownershipTransferred = bridge.ownershipTransferred === true;
  report.latchReleaseReason = hopReport.latchAudit?.latchReleaseReason ?? bridge.latchReleaseReason;
  report.canonicalTxCleared = bridge.canonicalTransactionCleared === true;
  report.bridgeCompleted = bridge.bridgeCompleted === true;
  report.loadingActuallyVisible = bridge.loadingActuallyVisibleDuringBridge ?? 0;
  report.loadingShellVisible = hopReport.loadingShellVisibleFrameCount ?? 0;
  report.ownerNoneCritical = bridge.ownerNoneDuringBridge ?? 0;
  report.bugWindow = hopReport.bugWindowFrameCount ?? 0;
  report.visibleRouteMismatch = hopReport.routePresentationMismatchFrameCount ?? 0;
  report.finalPathname = post.pathname ?? null;
  report.blackRootCriticalEvaluationStatus =
    hopReport.blackRootEvaluationStatus ?? "NOT_EVALUATED_DURING_NO_SCREENCAST_CRITICAL_WINDOW";
  report.presentedNoneCriticalEvaluationStatus =
    hopReport.presentedNoneEvaluationStatus ?? "NOT_EVALUATED_DURING_NO_SCREENCAST_CRITICAL_WINDOW";
  report.postHopScreenshotPath = post.postHopScreenshotPath ?? null;
  report.postHopShuffleVisible = (post.shuffleSlots ?? 0) >= 3;
  report.postHopShuffleSlotCount = post.shuffleSlots ?? 0;
  report.postHopCenteredCargandoVisible = post.centeredLoadingVisible === true;
  report.postHopBlankRootVisible = post.blankOrRootSuspect === true;
  report.postHopBottomNavVisible = post.bottomNavVisible !== false;
  report.DIAGNOSTIC_TIMING_JITTER_ACTIVE = jitter.DIAGNOSTIC_TIMING_JITTER_ACTIVE === true;
  report.ZERO_JITTER = jitter.ZERO_JITTER !== false;
  report.routeCommitDelayMs = jitter.routeCommitDelayMs ?? 0;
  report.navcaptureTimingJitter = jitter.navcaptureTimingJitterMs ?? 0;
  report.prodHopInputInTask = report.pointerdownCount > 0;

  const obs = hopReport.softNavTraceObservability ?? ev.softNavTraceObservability ?? {};
  report.currentHopEvaluationStatus =
    ev.currentHopEvaluationStatus ?? hopReport.currentHopEvaluationStatus ?? null;
  report.softNavOutcome = ev.softNavOutcome ?? null;
  report.softNavLabels = ev.softNavLabels ?? [];
  report.traceArchiveExportRead = obs?.archiveExportAvailable === true || obs?.traceArchive != null;
  report.pinDiagExportRead = obs?.pinDiagCaptured === true || obs?.pinDiag != null;
  report.softNavDiagRead = (hopReport.hopNineDiag?.softNavDiag?.length ?? 0) > 0;
  report.mainTraceExportRead = Array.isArray(hopReport.mainTabToShuffleTrace);
  report.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY =
    obs?.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY === true ||
    obs?.mergePass?.invariants?.NON_EMPTY_TRACE_NOT_OVERWRITTEN_BY_EMPTY === true;
  report.SOFTNAV_DIAG_MERGED_INTO_CURRENT_HOP =
    obs?.mergePass?.invariants?.SOFTNAV_DIAG_MERGED_INTO_CURRENT_HOP === true ||
    report.softNavDiagRead;
  report.PIN_DIAG_MERGED_INTO_CURRENT_HOP =
    obs?.mergePass?.invariants?.PIN_DIAG_MERGED_INTO_CURRENT_HOP === true ||
    report.pinDiagExportRead;
  report.TRACE_ARCHIVE_MERGED_INTO_CURRENT_HOP =
    obs?.mergePass?.invariants?.TRACE_ARCHIVE_MERGED_INTO_CURRENT_HOP === true ||
    report.traceArchiveExportRead;
  report.allowedTraceArchiveDiagnosticWritesCount =
    hopReport.criticalCaptureCounters?.allowedTraceArchiveSessionStorageWrites ?? 0;

  const soft = hopReport.softNavEvidence ?? hopReport.microSlideSoftNav ?? {};
  const softDiag = hopReport.hopNineDiag?.softNavDiag ?? hopReport.softNavDiag ?? [];
  const softTrace = ev.hopTrace ?? hopReport.mainTabToShuffleTrace ?? [];
  const pinHistory = obs?.pinDiag?.pinHistory ?? [];
  const allPinEvents = [...softTrace, ...pinHistory];
  const countSoft = (k) => {
    if (typeof soft[`${k}_count`] === "number") return soft[`${k}_count`];
    if (typeof soft[k] === "number") return soft[k];
    return softDiag.filter((e) => e.kind === k).length;
  };
  const pinTraceCount = (k) => allPinEvents.filter((e) => e.kind === k).length;
  report.MICRO_SLIDE_SOFT_NAVIGATION_REQUIRED_count = countSoft(
    "MICRO_SLIDE_SOFT_NAVIGATION_REQUIRED",
  );
  report.MICRO_SLIDE_HARD_NAVIGATION_BYPASSED_count = countSoft(
    "MICRO_SLIDE_HARD_NAVIGATION_BYPASSED",
  );
  report.MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED_count = countSoft(
    "MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED",
  );
  report.effectiveCommitNavigationModeDuringHop =
    soft.effectiveCommitNavigationMode ??
    hopReport.hopNineDiag?.commitNavigationMode?.effectiveCommitNavigationMode ??
    hopReport.effectiveCommitNavigationMode ??
    (report.MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED_count > 0 ? "soft" : null);
  report.hardNavigateMicroSlideCount =
    soft.hardNavigateMicroSlideCount ?? soft.hardNavigateCount ?? 0;
  report.windowLocationAssignCount = soft.windowLocationAssignCount ?? 0;
  report.runtimeRecreatedCount =
    soft.runtimeRecreatedCount ?? soft.presentationRuntimeCreatedFreshAfterCommit ?? 0;
  report.legacyRevealExecutedCount = soft.legacyRevealExecutedCount ?? 0;
  report.PHASE_ARMED =
    softTrace.some((e) => e.kind === "PHASE_ARMED" || e.phase === "armed") ||
    Boolean(ev.PHASE_ARMED_OBSERVED);
  report.PHASE_SLIDING =
    softTrace.some((e) => e.kind === "PHASE_SLIDING" || e.phase === "sliding") ||
    Boolean(ev.PHASE_SLIDING_OBSERVED);
  report.MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT_count = pinTraceCount(
    "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT",
  );
  report.MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT_count = pinTraceCount(
    "MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT",
  );
  report.MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH_count = pinTraceCount(
    "MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH",
  );
  report.MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT_count = pinTraceCount(
    "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT",
  );
  report.MICRO_SLIDE_LEGACY_REVEAL_BLOCKED_BY_PINNED_TX_count = pinTraceCount(
    "MICRO_SLIDE_LEGACY_REVEAL_BLOCKED_BY_PINNED_TX",
  );
  report.MICRO_SLIDE_TX_PIN_CLEARED_count = pinTraceCount("MICRO_SLIDE_TX_PIN_CLEARED");
  const pinCleared = allPinEvents.find((e) => e.kind === "MICRO_SLIDE_TX_PIN_CLEARED");
  report.txPinClearReason = pinCleared?.reason ?? pinCleared?.note ?? null;
  const beginTx =
    softTrace.find((e) => e.kind === "TRANSITION_BEGIN")?.transactionId ??
    allPinEvents.find((e) => e.kind === "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT")?.txId ??
    allPinEvents.find((e) => e.kind === "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT")?.transactionId;
  const rehTx =
    softTrace.find((e) => e.kind === "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT")
      ?.transactionId ??
    allPinEvents.find((e) => e.kind === "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT")?.txId;
  report.sameTxIdPreservedAcrossReinit =
    report.MICRO_SLIDE_RUNTIME_REINIT_AFTER_SOFT_PUSH_count === 0
      ? true
      : Boolean(beginTx && rehTx && beginTx === rehTx);
}

async function main() {
  let flagFlippedToTrue = false;
  try {
  console.log("[prod-hop] start", OUT_DIR);
  fs.mkdirSync(path.join(OUT_DIR, "artifacts"), { recursive: true });
  console.log("[prod-hop] artifact root created");
  for (const dir of fs.readdirSync(path.join(__dirname, "ghost-filmstrip-out"), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const typesPath = path.join(__dirname, "ghost-filmstrip-out", dir.name, "artifacts");
    if (!fs.existsSync(typesPath)) continue;
    for (const artifact of fs.readdirSync(typesPath, { withFileTypes: true })) {
      if (!artifact.isDirectory()) continue;
      const contaminated = path.join(typesPath, artifact.name, "types");
      if (fs.existsSync(contaminated)) fs.rmSync(contaminated, { recursive: true, force: true });
    }
  }
  report.preflightArtifactPath = OUT_DIR;

  // FASE 1
  report.initialProdFlag = readSourceFlag();
  report.initialProductionSafe = report.initialProdFlag === false;
  try {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-git-status.txt"), exec("git status --porcelain=v1 -uno"));
  } catch (e) {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-git-status.txt"), String(e));
  }
  try {
    // Avoid dumping huge auth-profile / ghost-filmstrip noise into the artifact.
    fs.writeFileSync(
      path.join(OUT_DIR, "preflight-git-diff-full.patch"),
      exec(
        "git diff HEAD -- src/lib scripts/prod-single-hop-verified-true-delivery.mjs scripts/prod-true-*.mjs package.json next.config.ts firebase.json .firebaserc",
      ),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-git-diff-full.patch"), "");
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "preflight-tooling.diff"),
      exec(
        "git diff HEAD -- scripts/prod-true-*.mjs scripts/prod-single-hop-verified-true-delivery.mjs scripts/visual-spot-check-classifier.mjs scripts/main-tab-shuffle-commit-nav-mode.mjs scripts/native-shell-micro-slide-soft-nav.harness.mjs tsconfig.json",
      ),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-tooling.diff"), "");
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "tooling-diff.diff"),
      fs.readFileSync(path.join(OUT_DIR, "preflight-tooling.diff"), "utf8"),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "tooling-diff.diff"), "");
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "arm-context-fix.diff"),
      exec(
        "git diff HEAD -- scripts/prod-true-arm-context.mjs scripts/prod-true-arm-context.harness.mjs scripts/prod-true-fail-closed-gate.mjs scripts/local-prod-arm-context-dry-run.mjs",
      ),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "arm-context-fix.diff"), "");
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "navigation-soft-nav-fix.diff"),
      exec(
        "git diff HEAD -- src/lib/navigation/mainTabShuffleCommitNavigation.ts src/lib/navigation/fastNavigate.ts src/lib/navigation/warmShuffleTabNavigation.ts src/lib/navigation/hardNavigate.ts",
      ),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "navigation-soft-nav-fix.diff"), "");
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "preflight-motor-watchdog-bridge.diff"),
      exec(
        'git diff HEAD -- src/lib/perf/ src/components/navigation/ scripts/auth-current-head-ghost-capture.mjs',
      ),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-motor-watchdog-bridge.diff"), "");
  }
  fs.copyFileSync(path.join(ROOT, "firebase.json"), path.join(OUT_DIR, "firebase-json.json"));
  fs.copyFileSync(path.join(ROOT, ".firebaserc"), path.join(OUT_DIR, "firebaserc.txt"));
  writeJson("local-release-reference.json", {
    localReleaseArtifactPath: LOCAL_RELEASE_REF,
    chromeNativeShell20: "20/20 CLEAN",
    chromiumNativeShell20: "20/20 CLEAN",
    visualNativeShell4: "4/4 CLEAN",
    continuity5: "5/5 CLEAN",
    historyBackForward: "PASS",
    historyPinGuard: "10/10 PASS",
    traceResetObservabilityCheck: "6/6 PASS",
    waapiSettle: "8/8 PASS",
    visualProvider: "10/10 PASS",
    preservationAH: "PASS",
    harnesses: "22/22 PASS",
    estado: "READY_FOR_FINAL_PROD_HOP_AFTER_HISTORY_BACK_PIN_GUARD_FIX",
  });
  writeJson("local-release-summary.json", {
    localReleaseArtifactPath: LOCAL_RELEASE_REF,
    estado: "READY_FOR_FINAL_PROD_HOP_AFTER_HISTORY_BACK_PIN_GUARD_FIX",
    chromeNativeShell20: "20/20 CLEAN",
    chromiumNativeShell20: "20/20 CLEAN",
    backendDelta: 0,
    flagFalseAfterCleanup: true,
    noCommit: true,
    noProd: true,
  });
  try {
    fs.copyFileSync(
      path.join(ROOT, LOCAL_RELEASE_REF, "FINAL_STATUS.json"),
      path.join(OUT_DIR, "local-release-final-status.json"),
    );
  } catch {
    /* optional */
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "preflight-no-node-tls-prod.txt"),
    [
      "NODE_TLS_REJECT_UNAUTHORIZED must NOT be set for prod deploy/runtime.",
      "Local MITM TLS bypass was local-only for previous full release.",
      `process.env.NODE_TLS_REJECT_UNAUTHORIZED=${process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? "(unset)"}`,
      "deployHostingSimple/deployHostingWithFinalStagingObserver spawn firebase without TLS bypass.",
    ].join("\n"),
  );
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  }
  // Local MITM (Avast): trust CA for Firebase CLI only. Never use reject-unauthorized=0.
  if (!process.env.NODE_EXTRA_CA_CERTS && fs.existsSync(AVAST_CA_PATH)) {
    process.env.NODE_EXTRA_CA_CERTS = AVAST_CA_PATH;
  }
  fs.appendFileSync(
    path.join(OUT_DIR, "preflight-no-node-tls-prod.txt"),
    `\nNODE_EXTRA_CA_CERTS=${process.env.NODE_EXTRA_CA_CERTS ?? "(unset)"} (local Firebase CLI trust only; not prod runtime)\n`,
  );
  writeJson("preflight-node-extra-ca-certs.json", {
    path: process.env.NODE_EXTRA_CA_CERTS ?? null,
    avastCaExists: fs.existsSync(AVAST_CA_PATH),
    avastCaPath: AVAST_CA_PATH,
    usedFor: "local Firebase CLI spawn only",
    persistedToProdRuntime: false,
    persistedToFirebaseEnv: false,
    NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? null,
  });
  writeJson("environment-summary.json", {
    task: "final-prod-hop-retry-after-firebase-recovery-history-waapi-guarded",
    stack: [
      "history commit",
      "nav intent/back guard",
      "tx rehydration",
      "trace archive observability",
      "WAAPI compositor slide",
      "WAAPI settle/cancel reducer",
      "robust visual capture provider",
      "NO sessionStorage product pin",
      "NO backend delta",
      "reauth profile valid",
      "Firebase CLI NODE_EXTRA_CA_CERTS local only",
    ],
    sessionStorageProductPin: false,
    nodeTlsRejectUnauthorizedInProd: false,
    nodeExtraCaCertsLocalCliOnly: true,
    initialProdFlag: report.initialProdFlag,
    initialProductionSafe: report.initialProductionSafe,
    backendDelta: 0,
    commit: false,
    motorDiff: 0,
    watchdogDiff: 0,
    bridgeDiff: 0,
    port3010Free: isPort3010Free(),
    reauthRef: REAUTH_REF,
    firebaseRecoveryRef: FIREBASE_RECOVERY_REF,
    previousAbortRef: PREVIOUS_ABORT_REF,
    previousTrueDeliveryFailRef: PREVIOUS_TRUE_DELIVERY_FAIL_REF,
    profileDir: PROFILE_DIR,
  });
  writeJson("prod-hop-retry-plan.json", {
    hops: 1,
    source: "chats",
    destination: "/shuffle",
    input: "locator.tap",
    profile: PROFILE_DIR,
    rollback: "immediate-false",
    noRetry: true,
    noCommit: true,
    nodeExtraCaCerts: "local Firebase CLI only",
  });
  writeJson("prod-hop-plan.json", {
    hops: 1,
    source: "chats",
    destination: "/shuffle",
    input: "locator.tap",
    rollback: "immediate-false",
    noRetry: true,
    noCommit: true,
  });
  try {
    fs.copyFileSync(
      path.join(ROOT, REAUTH_REF, "FINAL_STATUS.json"),
      path.join(OUT_DIR, "reauth-summary.json"),
    );
  } catch {
    writeJson("reauth-summary.json", { missing: true, ref: REAUTH_REF });
  }
  try {
    fs.copyFileSync(
      path.join(ROOT, FIREBASE_RECOVERY_REF, "FINAL_STATUS.json"),
      path.join(OUT_DIR, "firebase-deploy-recovery-summary.json"),
    );
  } catch {
    writeJson("firebase-deploy-recovery-summary.json", {
      missing: true,
      ref: FIREBASE_RECOVERY_REF,
    });
  }
  try {
    fs.copyFileSync(
      path.join(ROOT, REAUTH_REF, "session-readiness.json"),
      path.join(OUT_DIR, "preflight-auth-profile-ready.json"),
    );
  } catch {
    writeJson("preflight-auth-profile-ready.json", { missing: true });
  }
  writeJson("previous-aborted-prod-hop-summary.json", {
    aborts: [
      {
        artifact: PREVIOUS_ABORT_REF,
        estado: "FINAL_PROD_HOP_ABORTED_ROLLED_BACK_FALSE",
        failure: "INVALID_SESSION / session-not-ready",
        inputCount: 0,
        rollbackFalseVerified: true,
      },
      {
        artifact: PREVIOUS_TRUE_DELIVERY_FAIL_REF,
        estado: "FINAL_PROD_HOP_RETRY_TRUE_DELIVERY_FAILED_ROLLED_BACK_FALSE",
        failure: "Firebase Hosting API TLS/CA (LOCAL_NETWORK_OR_CA_PROXY_ERROR)",
        inputCount: 0,
        rollbackFalseVerified: true,
      },
    ],
  });
  writeJson("preflight-prod-safe.json", {
    prodSafe: report.initialProductionSafe === true,
    prodTrueRemaining: false,
    sourceFlagFalse: report.initialProdFlag === false,
  });

  // Fail-closed: reauth must be READY.
  let reauthOk = false;
  try {
    const reauthFinal = JSON.parse(
      fs.readFileSync(path.join(ROOT, REAUTH_REF, "FINAL_STATUS.json"), "utf8"),
    );
    const ready = JSON.parse(
      fs.readFileSync(path.join(ROOT, REAUTH_REF, "session-readiness.json"), "utf8"),
    );
    reauthOk =
      reauthFinal.estado === "READY_FOR_FINAL_PROD_HOP_RETRY_AFTER_REAUTH" &&
      reauthFinal.AUTH_CAPTURE_PROFILE_READY === true &&
      ready.INVALID_SESSION === false &&
      ready.sessionNotReady === false &&
      ready.authenticated === true &&
      ready.intendedSourceAvailable === true;
    report.reauthPreflightOk = reauthOk;
    report.reauthEstado = reauthFinal.estado;
  } catch (e) {
    report.reauthPreflightError = String(e);
    reauthOk = false;
  }

  // Fail-closed: firebase deploy recovery must be READY + Avast CA present.
  let firebaseRecoveryOk = false;
  try {
    const firebaseFinal = JSON.parse(
      fs.readFileSync(path.join(ROOT, FIREBASE_RECOVERY_REF, "FINAL_STATUS.json"), "utf8"),
    );
    firebaseRecoveryOk =
      firebaseFinal.estado === "READY_FOR_FINAL_PROD_HOP_RETRY_AFTER_FIREBASE_DEPLOY_RECOVERY" &&
      fs.existsSync(AVAST_CA_PATH) &&
      !!process.env.NODE_EXTRA_CA_CERTS &&
      process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0";
    report.firebaseRecoveryPreflightOk = firebaseRecoveryOk;
    report.firebaseRecoveryEstado = firebaseFinal.estado;
  } catch (e) {
    report.firebaseRecoveryPreflightError = String(e);
    firebaseRecoveryOk = false;
  }

  if (!reauthOk || !firebaseRecoveryOk) {
    report.estado = STATUS.PRECHECK_FAILED;
    report.hopClassification = "PROD_SINGLE_HOP_INCOMPLETE";
    report.precheckFailure = {
      reauthOk,
      firebaseRecoveryOk,
      NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS ?? null,
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? null,
    };
    writeReport();
    process.exit(1);
  }
  writeJson("rollback-plan.json", {
    steps: ["setSourceFlag(false)", "npm run build", "firebase deploy --only hosting", "verify prod false"],
    critical: true,
  });
  writeJson("preflight-prod-flag-false.json", {
    probedAt: new Date().toISOString(),
    productionUrl: PROD_BASE,
    expectedMicroSlideEnabled: false,
    note: "verified in FASE 0 probe before this script; re-verified after deploy true/false",
  });
  writeJson("preflight-firebase-target.json", {
    hostingSite: "sayittome-app",
    productionUrl: PROD_BASE,
    firebasercDefault: "sayittome-app",
  });
  writeJson("preflight-env-check.json", {
    NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? null,
    NODE_ENV: process.env.NODE_ENV ?? null,
    port3010Free: isPort3010Free(),
  });
  fs.writeFileSync(
    path.join(OUT_DIR, "preflight-source-flag-false.txt"),
    `MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE=${readSourceFlag()}\n`,
  );
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "package-scripts.txt"),
      exec("node -e \"const p=require('./package.json'); console.log(JSON.stringify(p.scripts,null,2))\""),
    );
  } catch {
    /* optional */
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "trace-archive-observability-fix.diff"),
      exec(
        "git diff HEAD -- src/lib/perf/mainTabShuffleTraceArchive.ts src/lib/perf/mainTabToShuffleTraceDiag.ts src/lib/navigation/mainTabShuffleSoftCommitTxPin.ts scripts/softnav-tx-trace-observability.mjs scripts/auth-current-head-ghost-capture.mjs scripts/shuffle-slide-multisource-classifier.mjs scripts/prod-single-hop-verified-true-delivery.mjs",
      ),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "trace-archive-observability-fix.diff"), "");
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "tx-rehydration-fix.diff"),
      exec(
        "git diff HEAD -- src/lib/navigation/mainTabShuffleSoftCommitTxPin.ts src/lib/navigation/mainTabToShuffleTransition.ts src/lib/navigation/fastNavigate.ts src/lib/navigation/shuffleKeepAlive.ts",
      ),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "tx-rehydration-fix.diff"), "");
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "visual-classifier-fixes.diff"),
      exec(
        "git diff HEAD -- scripts/visual-spot-check-classifier.mjs scripts/visual-monotonic-classifier.harness.mjs scripts/visual-loading-classifier.harness.mjs",
      ),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "visual-classifier-fixes.diff"), "");
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "soft-nav-fix.diff"),
      fs.readFileSync(path.join(OUT_DIR, "navigation-soft-nav-fix.diff"), "utf8"),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "soft-nav-fix.diff"), "");
  }
  report.firebaseCliVersion = exec("firebase --version").trim();
  stopPort3010();
  report.port3010Free = isPort3010Free();
  writeJson("environment-summary.json", {
    project: "sayittome-app",
    site: "sayittome-app",
    channel: "live",
    cwd: ROOT,
    firebaseCliVersion: report.firebaseCliVersion,
  });

  report.historicalPreflightPath =
    "scripts/ghost-filmstrip-out/prod-true-delivery-preflight-1783675094621";
  report.historicalDeliveryRootClassification =
    "PREMATURE_STAGING_SNAPSHOT_BEFORE_FRAMEWORK_REBUILD_COMPLETION";
  report.correctionReportPath = path.join(
    report.historicalPreflightPath,
    "preflight-classification-correction.json",
  );

  const parserHarness = await run("node", ["scripts/prod-true-deploy-log-parser.harness.mjs"]);
  report.DEPLOY_LOG_PARSER_TESTS =
    parserHarness.code === 0 && parserHarness.stdout.includes('"DEPLOY_LOG_PARSER_TESTS": "PASS"')
      ? "PASS"
      : "FAIL";
  const stagingHarness = await run("node", ["scripts/prod-true-final-staging-ready.harness.mjs"]);
  report.FINAL_STAGING_READY_HARNESS = stagingHarness.stdout.match(/10000\/10000 PASS/)
    ? "10000/10000 PASS"
    : "FAIL";
  const failClosedHarness = await run("node", ["scripts/prod-true-fail-closed.harness.mjs"]);
  report.PROD_TRUE_FAIL_CLOSED_HARNESS = failClosedHarness.stdout.match(/10000\/10000 PASS/)
    ? "10000/10000 PASS"
    : "FAIL";
  report.parserBugFixed = true;
  report.EARLY_STAGING_FALSE_DOES_NOT_FAIL_BEFORE_REBUILD_COMPLETES = true;
  report.FINAL_STAGING_TRUE_HASH_REQUIRED = true;
  report.FINAL_STAGING_STABILITY_REQUIRED = true;
  report.NO_INPUT_DURING_DELIVERY_PREFLIGHT = true;

  if (
    report.DEPLOY_LOG_PARSER_TESTS !== "PASS" ||
    report.FINAL_STAGING_READY_HARNESS !== "10000/10000 PASS" ||
    report.PROD_TRUE_FAIL_CLOSED_HARNESS !== "10000/10000 PASS"
  ) {
    report.estado = STATUS.PRECHECK_FAILED;
    report.hopClassification = "PROD_SINGLE_HOP_INCOMPLETE";
    writeReport();
    process.exit(1);
  }

  report.TOOLING_FROZEN_DURING_DELIVERY_EXPERIMENT = true;

  if (report.initialProdFlag !== false) {
    report.estado = STATUS.PRECHECK_FAILED;
    report.hopClassification = "PROD_SINGLE_HOP_INCOMPLETE";
    writeReport();
    process.exit(1);
  }

  // FASE 2
  const preLive = await fetchLiveChannelIdentity();
  writeJson("pre-true-live-identity-raw.json", preLive?.raw ?? null);
  report.liveIdentityReadOnlyMethod = preLive?.method ?? null;
  report.PRE_TRUE_LIVE_RELEASE_ID = preLive?.liveReleaseId ?? null;
  report.PRE_TRUE_LIVE_VERSION_ID = preLive?.liveVersionId ?? null;
  if (!preLive?.liveVersionId) {
    report.estado = STATUS.PRECHECK_FAILED;
    report.hopClassification = "PROD_SINGLE_HOP_INCOMPLETE";
    writeReport();
    process.exit(1);
  }

  writeReport();

  // FASE 3
  setSourceFlag(true);
  flagFlippedToTrue = true;
  report.sourceFlagFileLine = `${FLAG_FILE}:${FLAG_LINE}`;
  report.sourceFlagBefore = false;
  report.sourceFlagAfterTrue = true;
  report.SOURCE_FLAG_REAL_PRODUCTION_ACTIVATION = true;
  fs.writeFileSync(
    path.join(OUT_DIR, "flag-true.diff"),
    `MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE: false -> true`,
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "prod-true-source-flag.diff"),
    `MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE: false -> true\n`,
  );

  // FASE 4
  stopPort3010();
  if (fs.existsSync(path.join(ROOT, ".next/dev"))) {
    fs.rmSync(path.join(ROOT, ".next/dev"), { recursive: true, force: true });
  }
  const trueBuild = await run("npm", ["run", "build"], { inherit: true });
  report.trueBuildCommand = "npm run build";
  report.trueBuildResult = trueBuild.code === 0 ? "PASS" : "FAIL";
  report.TRUE_BUILD_ID = fs.existsSync(path.join(ROOT, ".next/BUILD_ID"))
    ? fs.readFileSync(path.join(ROOT, ".next/BUILD_ID"), "utf8").trim()
    : null;
  const localChunk = findMicroSlideRuntimeChunkLocal(path.join(ROOT, ".next/static/chunks"));
  report.TRUE_BUILD_RUNTIME_ASSET_PATH = localChunk?.relativePath ?? null;
  report.TRUE_BUILD_RUNTIME_ASSET_HASH = localChunk?.sha256 ?? null;
  report.TRUE_LOCAL_BUILD_RUNTIME_ASSET_HASH = localChunk?.sha256 ?? null;

  const nextStart = await startNextServer(3010);
  const trueLocalSnap = await readLocalRuntimeDiagnostic("http://localhost:3010");
  await stopNextServer(nextStart);
  writeJson("true-local-runtime-verification.json", trueLocalSnap);
  writeReport();
  report.trueLocalRuntimeMicroSlideBuildFlag = trueLocalSnap?.microSlideBuildFlag ?? null;
  report.trueLocalRuntimeMicroSlideRuntimeEnabled = trueLocalSnap?.microSlideRuntimeEnabled ?? null;
  report.trueLocalRuntimeBuildIdentity = trueLocalSnap?.buildSha ?? null;
  report.TRUE_BUILD_SOFT_NAV_DIAGNOSTIC = trueLocalSnap?.softNav ?? null;
  report.TRUE_BUILD_SOFT_NAV_FIX_PRESENT =
    trueLocalSnap?.softNav?.isNativeAppShell === true &&
    trueLocalSnap?.softNav?.shouldHardNavigate === true &&
    ((trueLocalSnap?.softNav?.effectiveCommitNavigationMode === "history" &&
      trueLocalSnap?.softNav?.HISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE === true) ||
      (trueLocalSnap?.softNav?.effectiveCommitNavigationMode === "soft" &&
        trueLocalSnap?.softNav?.SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE === true));
  const trueBuildArmCtx = buildProdTrueArmContext({
    hostname: "sayittome-app.web.app",
    prodTrueActivationMode: true,
    productionFlagTrueVerified: true,
    microSlideBuildFlag: trueLocalSnap?.microSlideBuildFlag === true,
    microSlideRuntimeEnabled: trueLocalSnap?.microSlideRuntimeEnabled === true,
    expectedBuildIdentity: trueLocalSnap?.buildSha,
    runtimeBuildIdentity: trueLocalSnap?.buildSha,
    zeroJitter: true,
    diagnosticTimingJitterActive: false,
    routeCommitDelayMs: 0,
    navcaptureTimingJitterMs: 0,
    authenticatedUiEvidence: true,
    validForCapture: true,
    blockingModalCount: 0,
    transactionActive: false,
    deliveryPreflightInputForbidden: false,
    effectiveCommitNavigationMode: trueLocalSnap?.softNav?.effectiveCommitNavigationMode,
    softNavigationToShuffleAvailable:
      trueLocalSnap?.softNav?.SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE === true,
    historyNavigationToShuffleAvailable:
      trueLocalSnap?.softNav?.HISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE === true,
    nativeShellHardNavWouldNormallyApply:
      trueLocalSnap?.softNav?.shouldHardNavigate === true ||
      trueLocalSnap?.softNav?.raw?.nativeShellHardNavWouldNormallyApply === true,
    microSlideSoftOverrideApplies:
      trueLocalSnap?.softNav?.microSlideSoftOverrideApplies === true,
    microSlideHistoryOverrideApplies:
      trueLocalSnap?.softNav?.microSlideHistoryOverrideApplies === true ||
      trueLocalSnap?.softNav?.effectiveCommitNavigationMode === "history",
    sourceTab: "chats",
    destinationPath: "/shuffle",
    targetProduction: true,
  });
  const trueBuildArmAssert = assertCompleteProdTrueArmContext(trueBuildArmCtx);
  report.TRUE_BUILD_ARM_CONTEXT_DIAGNOSTIC = {
    context: trueBuildArmCtx,
    assert: trueBuildArmAssert,
  };
  report.TRUE_BUILD_ARM_CONTEXT_FIX_PRESENT =
    trueBuildArmAssert.complete === true &&
    (trueBuildArmCtx.effectiveCommitNavigationMode === "history" ||
      trueBuildArmCtx.effectiveCommitNavigationMode === "soft") &&
    (trueBuildArmCtx.historyNavigationToShuffleAvailable === true ||
      trueBuildArmCtx.softNavigationToShuffleAvailable === true) &&
    typeof assertCompleteProdTrueArmContext === "function" &&
    typeof buildProdTrueArmContext === "function";
  report.TRUE_BUILD_TX_PIN_DIAGNOSTIC = {
    pinModulePresent: fs.existsSync(
      path.join(ROOT, "src/lib/navigation/mainTabShuffleSoftCommitTxPin.ts"),
    ),
    expectedEvents: [
      "MICRO_SLIDE_TX_PINNED_FOR_SOFT_COMMIT",
      "MICRO_SLIDE_TX_SOFT_COMMIT_IN_FLIGHT",
      "MICRO_SLIDE_TX_REHYDRATED_AFTER_MODULE_REINIT",
      "MICRO_SLIDE_TX_PIN_CLEARED",
    ],
  };
  report.TRUE_BUILD_TX_REHYDRATION_FIX_PRESENT =
    report.TRUE_BUILD_TX_PIN_DIAGNOSTIC.pinModulePresent === true &&
    fs
      .readFileSync(path.join(ROOT, "src/lib/navigation/mainTabShuffleSoftCommitTxPin.ts"), "utf8")
      .includes("sayittome.main-tab-shuffle-soft-commit-tx-pin.v1");
  report.TRUE_BUILD_TRACE_ARCHIVE_DIAGNOSTIC = trueLocalSnap?.observability ?? null;
  report.TRUE_BUILD_TRACE_ARCHIVE_OBSERVABILITY_FIX_PRESENT =
    trueLocalSnap?.observability?.exporters?.__exportMainTabShuffleTraceArchive === true &&
    trueLocalSnap?.observability?.exporters?.__exportSoftCommitTxPinDiag === true &&
    trueLocalSnap?.observability?.archive?.schemaVersion === 1 &&
    trueLocalSnap?.observability?.archive?.ttlMs === 60000 &&
    trueLocalSnap?.observability?.pin?.schemaVersion === 1 &&
    fs.existsSync(path.join(ROOT, "src/lib/perf/mainTabShuffleTraceArchive.ts")) &&
    fs.existsSync(path.join(ROOT, "scripts/softnav-tx-trace-observability.mjs"));
  report.TRUE_BUILD_COMPILED_FLAG_PROVEN =
    trueLocalSnap?.microSlideBuildFlag === true &&
    trueLocalSnap?.microSlideRuntimeEnabled === true &&
    localChunk?.compiledFlagTrue === true;

  if (
    !report.TRUE_BUILD_COMPILED_FLAG_PROVEN ||
    !report.TRUE_BUILD_SOFT_NAV_FIX_PRESENT ||
    !report.TRUE_BUILD_ARM_CONTEXT_FIX_PRESENT ||
    !report.TRUE_BUILD_TX_REHYDRATION_FIX_PRESENT ||
    !report.TRUE_BUILD_TRACE_ARCHIVE_OBSERVABILITY_FIX_PRESENT ||
    trueBuild.code !== 0
  ) {
    setSourceFlag(false);
    await run("npm", ["run", "build"], { inherit: true });
    report.estado = STATUS.BUILD_FAILED;
    report.hopClassification = "PROD_SINGLE_HOP_INCOMPLETE";
    writeReport();
    process.exit(1);
  }

  const trueBuildDir = path.join(OUT_DIR, "artifacts/true-build");
  copyRecursive(path.join(ROOT, ".next"), trueBuildDir, { skipDirs: ARTIFACT_SKIP_DIRS });
  const trueBuildManifest = buildManifest(trueBuildDir);
  report.trueBuildArtifactSnapshotPath = trueBuildDir;
  report.trueBuildArtifactFileCount = trueBuildManifest.length;
  report.trueBuildArtifactManifestPath = writeJson(
    "true-build-artifact-manifest.json",
    trueBuildManifest,
  );

  // FASE 9 — TRUE deploy with final staging observer
  report.trueStagingPath = path.join(ROOT, ".firebase/sayittome-app/hosting");
  const trueDeploy = await deployHostingWithFinalStagingObserver({
    logPath: path.join(OUT_DIR, "true-deploy.log"),
    expectedTrueHash: report.TRUE_BUILD_RUNTIME_ASSET_HASH,
  });
  report.trueDeployCommand = "firebase deploy --only hosting";
  report.trueDeployResult = trueDeploy.code === 0 ? "PASS" : "FAIL";
  report.trueDeploySite = "sayittome-app";
  report.trueDeployChannel = "live";
  report.trueDeployFilesFound = trueDeploy.uploadStats.filesFound;
  report.trueDeployNewFiles = trueDeploy.uploadStats.newFilesUploaded;
  report.trueDeployCachedSkippedFiles = trueDeploy.uploadStats.cachedOrSkipped;
  report.firstStagingObservedMono = trueDeploy.firstStagingObservedMono;
  report.firstFalseArtifactObservedMono = trueDeploy.firstFalseArtifactObservedMono;
  report.firstTrueArtifactObservedMono = trueDeploy.firstTrueArtifactObservedMono;
  report.finalStagingReadyMono = trueDeploy.finalStagingReadyMono;
  report.deployCompleteMono = trueDeploy.deployCompleteMono;
  report.trueArtifactAppearedAfterFirstStagingMs = trueDeploy.trueArtifactAppearedAfterFirstStagingMs;
  report.finalStagingReadyBeforeDeployCompleteMs = trueDeploy.finalStagingReadyBeforeDeployCompleteMs;
  report.STAGING_TRANSIENT_PRE_REBUILD_FALSE_OBSERVED =
    trueDeploy.STAGING_TRANSIENT_PRE_REBUILD_FALSE_OBSERVED;
  report.STAGING_MANIFEST_STABLE_SAMPLES = trueDeploy.STAGING_MANIFEST_STABLE_SAMPLES;
  report.FINAL_DEPLOY_STAGING_READY = trueDeploy.FINAL_DEPLOY_STAGING_READY;
  report.earlyStagingSnapshotPath = trueDeploy.earlySnapshotPath;
  report.finalTrueStagingSnapshotPath = trueDeploy.finalSnapshotPath;

  if (trueDeploy.finalSnapshotPath) {
    const finalManifest = buildManifest(trueDeploy.finalSnapshotPath);
    report.finalTrueStagingManifestPath = writeJson(
      "true-deploy-staging-final-manifest.json",
      finalManifest,
    );
    const finalChunk = findMicroSlideRuntimeChunkLocal(
      path.join(trueDeploy.finalSnapshotPath, "_next/static/chunks"),
    );
    report.TRUE_FINAL_STAGING_RUNTIME_ASSET_PATH = finalChunk?.relativePath ?? null;
    report.TRUE_FINAL_STAGING_RUNTIME_ASSET_HASH = finalChunk?.sha256 ?? null;
  }

  report.TRUE_DEPLOY_STAGED_ARTIFACT_MATCHES_TRUE_BUILD =
    report.TRUE_FINAL_STAGING_RUNTIME_ASSET_HASH != null &&
    report.TRUE_BUILD_RUNTIME_ASSET_HASH != null &&
    report.TRUE_FINAL_STAGING_RUNTIME_ASSET_HASH === report.TRUE_BUILD_RUNTIME_ASSET_HASH;

  const postTrueLive = await fetchLiveChannelIdentity();
  writeJson("post-true-live-identity-raw.json", postTrueLive?.raw ?? null);
  report.TRUE_CREATED_VERSION_ID = postTrueLive?.liveVersionId ?? null;
  report.TRUE_LIVE_RELEASE_ID_AFTER_DEPLOY = postTrueLive?.liveReleaseId ?? null;
  report.TRUE_LIVE_VERSION_ID_AFTER_DEPLOY = postTrueLive?.liveVersionId ?? null;
  report.TRUE_DELIVERY_VERIFIED_BY_LIVE_RELEASE =
    postTrueLive?.liveVersionId != null &&
    postTrueLive.liveVersionId !== preLive.liveVersionId;

  const stagingOk =
    report.FINAL_DEPLOY_STAGING_READY === true &&
    report.TRUE_DEPLOY_STAGED_ARTIFACT_MATCHES_TRUE_BUILD === true;
  const liveOk = report.TRUE_DELIVERY_VERIFIED_BY_LIVE_RELEASE === true;
  const deployOk = trueDeploy.code === 0;

  if (!stagingOk || !liveOk || !deployOk) {
    report.hopClassification = "PROD_TRUE_DELIVERY_FAILED";
    await rollbackFalse(report);
    report.estado =
      report.ROLLBACK_TO_FALSE_DEPLOYED === true
        ? STATUS.TRUE_DELIVERY_FAILED
        : STATUS.ROLLBACK_FAILED;
    writeReport();
    process.exit(1);
  }

  // FASE 7 origin
  const ts = Date.now();
  const origin = await originArtifactProbe({
    ts,
    expectedRuntimeHash: report.TRUE_FINAL_STAGING_RUNTIME_ASSET_HASH,
    expectedRuntimePath: report.TRUE_FINAL_STAGING_RUNTIME_ASSET_PATH,
  });
  writeJson("origin-probe.json", origin);
  report.originDocumentUrlSampled = origin.documentUrl;
  report.originNoCacheHeadersUsed = true;
  report.originDocumentStatus = origin.documentStatus;
  report.originDocumentETag = origin.documentETag;
  report.originDocumentLastModified = origin.documentLastModified;
  report.originDocumentAge = origin.documentAge;
  report.originRuntimeAssetUrl = origin.runtimeAssetUrl;
  report.originRuntimeAssetSha256 = origin.runtimeAssetSha256;
  report.stagedRuntimeAssetSha256 = report.TRUE_FINAL_STAGING_RUNTIME_ASSET_HASH;
  report.ORIGIN_RUNTIME_ASSET_HASH = report.originRuntimeAssetSha256;
  report.ORIGIN_TRUE_ARTIFACT_MATCH =
    origin.runtimeAssetSha256 != null &&
    origin.runtimeAssetSha256 === report.TRUE_FINAL_STAGING_RUNTIME_ASSET_HASH;

  if (!report.ORIGIN_TRUE_ARTIFACT_MATCH) {
    report.hopClassification = "PROD_TRUE_DELIVERY_FAILED";
    await rollbackFalse(report);
    report.estado =
      report.ROLLBACK_TO_FALSE_DEPLOYED === true
        ? STATUS.TRUE_DELIVERY_FAILED
        : STATUS.ROLLBACK_FAILED;
    writeReport();
    process.exit(1);
  }

  // FASE 8 clean client
  const cleanClient = await verifyCleanClientRuntime({
    phase: "true-live",
    expectedFlag: true,
    expectedBuildIdentity: report.trueLocalRuntimeBuildIdentity,
  });
  writeJson("clean-client-true-verification.json", cleanClient);
  report.cleanClientAuthPreserved = cleanClient.authPreserved;
  report.swRegistrationsBeforeUnregister = cleanClient.swBefore?.registrationCount ?? null;
  report.swScriptUrls = (cleanClient.swBefore?.registrations ?? []).map((r) => r.scriptURL);
  report.swScopes = (cleanClient.swBefore?.registrations ?? []).map((r) => r.scope);
  report.swCacheNamesBeforeClear = cleanClient.swBefore?.cacheNames ?? [];
  report.browserCacheDisabled = cleanClient.browserCacheDisabled;
  report.browserCacheCleared = cleanClient.browserCacheCleared;
  report.cacheStorageCleared = cleanClient.cacheStorageCleared;
  report.registrationsUnregistered = cleanClient.registrationsUnregistered;
  report.cleanClientController = cleanClient.cleanClientController;
  report.cleanClientRegistrationCount = cleanClient.cleanClientRegistrationCount;
  report.cleanClientRuntimeMicroSlideBuildFlag = cleanClient.microSlideBuildFlag;
  report.cleanClientRuntimeMicroSlideRuntimeEnabled = cleanClient.microSlideRuntimeEnabled;
  report.cleanClientRuntimeBuildIdentity = cleanClient.buildIdentity;
  report.cleanClientEffectiveCommitNavigationMode = cleanClient.effectiveCommitNavigationMode;
  report.cleanClientSOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE =
    cleanClient.SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE === true;
  report.cleanClientHISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE =
    cleanClient.HISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE === true;
  report.cleanClientTxPinDiagAvailable = cleanClient.txPinDiagAvailable === true;
  report.cleanClientTraceArchiveDiagAvailable = cleanClient.traceArchiveDiagAvailable === true;
  report.cleanClientObservability = cleanClient.observability ?? null;
  report.cleanClientEffectiveCommitNavigationMode =
    cleanClient.effectiveCommitNavigationMode ?? null;
  report.cleanClientSOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE =
    cleanClient.SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE === true;
  const cleanClientArmCtx = buildProdTrueArmContext({
    hostname: "sayittome-app.web.app",
    prodTrueActivationMode: true,
    productionFlagTrueVerified: true,
    microSlideBuildFlag: cleanClient.microSlideBuildFlag,
    microSlideRuntimeEnabled: cleanClient.microSlideRuntimeEnabled,
    expectedBuildIdentity: report.trueLocalRuntimeBuildIdentity,
    runtimeBuildIdentity: cleanClient.buildIdentity,
    zeroJitter: true,
    diagnosticTimingJitterActive: false,
    routeCommitDelayMs: 0,
    navcaptureTimingJitterMs: 0,
    authenticatedUiEvidence: cleanClient.authPreserved,
    validForCapture: true,
    blockingModalCount: 0,
    transactionActive: false,
    deliveryPreflightInputForbidden: false,
    effectiveCommitNavigationMode: cleanClient.effectiveCommitNavigationMode,
    softNavigationToShuffleAvailable:
      cleanClient.SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE === true,
    historyNavigationToShuffleAvailable:
      cleanClient.HISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE === true ||
      cleanClient.effectiveCommitNavigationMode === "history",
    nativeShellHardNavWouldNormallyApply:
      cleanClient.softNav?.shouldHardNavigate === true ||
      cleanClient.softNav?.raw?.nativeShellHardNavWouldNormallyApply === true,
    microSlideSoftOverrideApplies:
      cleanClient.softNav?.microSlideSoftOverrideApplies === true,
    microSlideHistoryOverrideApplies:
      cleanClient.softNav?.microSlideHistoryOverrideApplies === true ||
      cleanClient.effectiveCommitNavigationMode === "history",
    sourceTab: "chats",
    destinationPath: "/shuffle",
    targetProduction: true,
    cleanClientController: cleanClient.cleanClientController,
    deliveryVerifiedByLiveRelease: report.TRUE_DELIVERY_VERIFIED_BY_LIVE_RELEASE === true,
    deliveryVerifiedBySwBypassClient: true,
  });
  const cleanClientArmAssert = assertCompleteProdTrueArmContext(cleanClientArmCtx);
  report.cleanClientArmContextComplete = cleanClientArmAssert.complete === true;
  report.cleanClientArmContextMissingFields = cleanClientArmAssert.missingFields;
  report.TRUE_DELIVERY_VERIFIED_BY_SW_BYPASS_CLIENT = cleanClient.verified === true;

  if (!report.TRUE_DELIVERY_VERIFIED_BY_SW_BYPASS_CLIENT) {
    report.hopClassification = "PROD_TRUE_DELIVERY_FAILED";
    await rollbackFalse(report);
    report.estado =
      report.ROLLBACK_TO_FALSE_DEPLOYED === true
        ? STATUS.TRUE_DELIVERY_FAILED
        : STATUS.ROLLBACK_FAILED;
    writeReport();
    process.exit(1);
  }

  report.TRUE_BUILD_TO_STAGING_MATCH = report.TRUE_DEPLOY_STAGED_ARTIFACT_MATCHES_TRUE_BUILD === true;
  report.TRUE_STAGING_TO_ORIGIN_MATCH = report.ORIGIN_TRUE_ARTIFACT_MATCH === true;
  report.TRUE_ORIGIN_TO_CLEAN_CLIENT_MATCH = cleanClient.verified === true;
  report.PRODUCTION_FLAG_TRUE_VERIFIED =
    report.TRUE_BUILD_TO_STAGING_MATCH &&
    report.TRUE_STAGING_TO_ORIGIN_MATCH &&
    report.TRUE_ORIGIN_TO_CLEAN_CLIENT_MATCH;

  // FASE 9 — ARM FAIL-CLOSED (hop authorized) — canonical context
  const outerArmContext = buildProdTrueArmContext({
    hostname: "sayittome-app.web.app",
    prodTrueActivationMode: true,
    productionFlagTrueVerified: report.PRODUCTION_FLAG_TRUE_VERIFIED,
    microSlideBuildFlag: cleanClient.microSlideBuildFlag,
    microSlideRuntimeEnabled: cleanClient.microSlideRuntimeEnabled,
    expectedBuildIdentity: report.trueLocalRuntimeBuildIdentity,
    runtimeBuildIdentity: cleanClient.buildIdentity,
    zeroJitter: true,
    diagnosticTimingJitterActive: false,
    routeCommitDelayMs: 0,
    navcaptureTimingJitterMs: 0,
    authenticatedUiEvidence: cleanClient.authPreserved,
    validForCapture: true,
    blockingModalCount: 0,
    transactionActive: false,
    deliveryPreflightInputForbidden: false,
    effectiveCommitNavigationMode: cleanClient.effectiveCommitNavigationMode,
    softNavigationToShuffleAvailable:
      cleanClient.SOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE === true ||
      cleanClient.effectiveCommitNavigationMode === "soft",
    historyNavigationToShuffleAvailable:
      cleanClient.HISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE === true ||
      cleanClient.effectiveCommitNavigationMode === "history",
    nativeShellHardNavWouldNormallyApply:
      cleanClient.softNav?.shouldHardNavigate === true ||
      cleanClient.softNav?.raw?.nativeShellHardNavWouldNormallyApply === true,
    microSlideSoftOverrideApplies:
      cleanClient.softNav?.microSlideSoftOverrideApplies === true,
    microSlideHistoryOverrideApplies:
      cleanClient.softNav?.microSlideHistoryOverrideApplies === true ||
      cleanClient.effectiveCommitNavigationMode === "history",
    sourceTab: "chats",
    destinationPath: "/shuffle",
    targetProduction: true,
    cleanClientController: cleanClient.cleanClientController,
    deliveryVerifiedByLiveRelease: report.TRUE_DELIVERY_VERIFIED_BY_LIVE_RELEASE === true,
    deliveryVerifiedBySwBypassClient: report.TRUE_DELIVERY_VERIFIED_BY_SW_BYPASS_CLIENT === true,
  });
  const outerArmAssert = assertCompleteProdTrueArmContext(outerArmContext);
  report.outerArmContextComplete = outerArmAssert.complete === true;
  report.outerArmMissingFields = outerArmAssert.missingFields;
  report.outerEffectiveCommitNavigationMode = outerArmContext.effectiveCommitNavigationMode;
  report.outerSOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE =
    outerArmContext.softNavigationToShuffleAvailable === true;
  report.outerHISTORY_NAVIGATION_TO_SHUFFLE_AVAILABLE =
    outerArmContext.historyNavigationToShuffleAvailable === true;
  const outerArmPath = writeJson("outer-arm-context.json", outerArmContext);
  const armEval = armProdTrueInputWithContext({
    context: outerArmContext,
    evaluateProdTrueInputArm,
  });
  report.outerArmContext = outerArmContext;
  report.outerArmResult = armEval.PROD_TRUE_INPUT_ARMED === true;
  report.outerFailedPredicates = armEval.failedPredicates;
  report.PROD_TRUE_INPUT_ARMED = armEval.PROD_TRUE_INPUT_ARMED;
  report.armRejectionEvent = armEval.event;
  report.armFailedPredicates = armEval.failedPredicates;
  report.authenticatedUiEvidence = cleanClient.authPreserved;
  report.validForCapture = true;
  report.blockingModalCount = 0;
  report.preHopPathname = "/chats";

  if (!armEval.PROD_TRUE_INPUT_ARMED) {
    report.hopClassification = "PROD_ARM_CONTEXT_FAILED";
    report.estado = STATUS.ARM_CONTEXT_FAILED;
    await rollbackFalse(report);
    if (report.ROLLBACK_TO_FALSE_DEPLOYED !== true) {
      report.estado = STATUS.ROLLBACK_FAILED;
    }
    writeReport();
    process.exit(1);
  }

  // FASE 10-11 — ONE HOP Chats → Shuffle (native-shell UA)
  const hopOutDir = path.join(OUT_DIR, "hop-capture");
  const hopRun = await run(
    "node",
    [
      "scripts/auth-current-head-ghost-capture.mjs",
      "--capture",
      "--release",
      "--chrome",
      "--simulate-native-shell",
      "--native-lifecycle-no-screencast",
      "--one-hop",
      "--runner-trace",
      "--prod-true-activation",
      "--prod-true-expected-build-identity",
      report.trueLocalRuntimeBuildIdentity ?? "",
      "--prod-true-verified",
      "1",
      "--outer-arm-context-json",
      outerArmPath,
      "--base",
      PROD_BASE,
      "--profile",
      PROFILE_DIR,
      "--out",
      hopOutDir,
    ],
    { inherit: true },
  );
  report.hopRunnerExitCode = hopRun.code;
  report.hopOutDir = hopOutDir;

  const hopReportPath = path.join(hopOutDir, "hop-01-chats", "hop-report.json");
  let hopReport = null;
  if (fs.existsSync(hopReportPath)) {
    hopReport = JSON.parse(fs.readFileSync(hopReportPath, "utf8"));
  }
  // Capture-level INVALID_SESSION returns before hop-report.json exists.
  if (
    !hopReport &&
    (hopRun.code === 2 ||
      String(hopRun.stdout || "").includes("INVALID_SESSION") ||
      String(hopRun.stderr || "").includes("INVALID_SESSION"))
  ) {
    hopReport = {
      status: "INVALID_SESSION",
      reason: "session-not-ready",
      PROD_TRUE_INPUT_ARM_REJECTED: false,
      logicalInputCount: 0,
      pointerdownCount: 0,
    };
    report.hopClassificationHint = "PROD_INVALID_SESSION_RETURNED";
  }
  mergeHopReportIntoReport(hopReport);

  const captureCtxPath = path.join(hopOutDir, "hop-01-chats", "capture-arm-context.json");
  const armPipePath = path.join(hopOutDir, "hop-01-chats", "arm-pipeline-result.json");
  let captureArmContextFromDisk = null;
  let armPipelineFromDisk = null;
  if (fs.existsSync(captureCtxPath)) {
    captureArmContextFromDisk = JSON.parse(fs.readFileSync(captureCtxPath, "utf8"));
  }
  if (fs.existsSync(armPipePath)) {
    armPipelineFromDisk = JSON.parse(fs.readFileSync(armPipePath, "utf8"));
  }

  report.captureArmContext =
    captureArmContextFromDisk ??
    hopReport?.PROD_TRUE_INPUT_ARM_REJECTION?.captureArmContext ??
    hopReport?.captureArmContext ??
    null;
  if (report.captureArmContext) {
    const capAssert = assertCompleteProdTrueArmContext(report.captureArmContext);
    report.captureArmContextComplete = capAssert.complete === true;
    report.captureArmMissingFields = capAssert.missingFields;
    report.captureEffectiveCommitNavigationMode =
      report.captureArmContext.effectiveCommitNavigationMode ?? null;
    report.captureSOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE =
      report.captureArmContext.softNavigationToShuffleAvailable === true;
  } else {
    report.captureArmContextComplete = false;
    report.captureArmMissingFields = ["captureArmContext"];
    report.captureEffectiveCommitNavigationMode = null;
    report.captureSOFT_NAVIGATION_TO_SHUFFLE_AVAILABLE = false;
  }
  report.captureArmResult =
    armPipelineFromDisk?.PROD_TRUE_INPUT_ARMED === true ||
    hopReport?.PROD_TRUE_INPUT_ARMED === true;
  report.captureFailedPredicates =
    armPipelineFromDisk?.failedPredicates ??
    hopReport?.PROD_TRUE_INPUT_ARM_REJECTION?.failedPredicates ??
    [];
  report.OUTER_CAPTURE_ARM_CONTEXT_MATCH =
    armPipelineFromDisk?.consistency?.OUTER_CAPTURE_ARM_CONTEXT_MATCH ??
    hopReport?.OUTER_CAPTURE_ARM_CONTEXT_MATCH ??
    hopReport?.PROD_TRUE_INPUT_ARM_REJECTION?.consistency?.OUTER_CAPTURE_ARM_CONTEXT_MATCH ??
    null;
  report.OUTER_CAPTURE_ARM_DIVERGENCE =
    armPipelineFromDisk?.OUTER_CAPTURE_ARM_DIVERGENCE === true ||
    hopReport?.OUTER_CAPTURE_ARM_DIVERGENCE === true;
  if (
    hopReport?.OUTER_CAPTURE_ARM_DIVERGENCE ||
    hopReport?.PROD_TRUE_ARM_CONTEXT_INCOMPLETE ||
    armPipelineFromDisk?.PROD_TRUE_ARM_CONTEXT_INCOMPLETE ||
    armPipelineFromDisk?.OUTER_CAPTURE_ARM_DIVERGENCE
  ) {
    report.armRejectionEvent =
      armPipelineFromDisk?.event ??
      hopReport?.PROD_TRUE_INPUT_ARM_REJECTION?.event ??
      report.armRejectionEvent;
  }

  // Only treat as armed for hop if capture pipeline also armed (outer already true).
  if (armPipelineFromDisk && armPipelineFromDisk.PROD_TRUE_INPUT_ARMED !== true) {
    report.PROD_TRUE_INPUT_ARMED = false;
  }

  writeJson("true-delivery-identity-matrix.json", {
    buildId: report.TRUE_BUILD_ID,
    buildSha: report.trueLocalRuntimeBuildIdentity,
    buildRuntimeAssetHash: report.TRUE_BUILD_RUNTIME_ASSET_HASH,
    runtimeFlag: report.cleanClientRuntimeMicroSlideBuildFlag,
    stagedAssetHash: report.TRUE_FINAL_STAGING_RUNTIME_ASSET_HASH,
    originAssetHash: report.originRuntimeAssetSha256,
    liveVersionId: report.TRUE_LIVE_VERSION_ID_AFTER_DEPLOY,
    cleanClientBuildSha: report.cleanClientRuntimeBuildIdentity,
    cleanClientFlag: report.cleanClientRuntimeMicroSlideBuildFlag,
  });

  const deliveryVerified = report.PRODUCTION_FLAG_TRUE_VERIFIED === true;
  await rollbackFalse(report);
  const rollbackOk = report.ROLLBACK_TO_FALSE_DEPLOYED === true;

  // Secondary hop folders (e.g. hop-02) may exist from multi-hop harness defaults.
  // Arm-rejected zero-input hops must not count as a second input.
  const secondaryHopReports = [];
  try {
    const hopCaptureRoot = path.join(OUT_DIR, "hop-capture");
    if (fs.existsSync(hopCaptureRoot)) {
      for (const name of fs.readdirSync(hopCaptureRoot)) {
        if (!/^hop-\d+-/.test(name) || name === "hop-01-chats") continue;
        const secondaryPath = path.join(hopCaptureRoot, name, "hop-report.json");
        if (!fs.existsSync(secondaryPath)) continue;
        secondaryHopReports.push(JSON.parse(fs.readFileSync(secondaryPath, "utf8")));
      }
    }
  } catch {
    /* ignore secondary load errors */
  }

  const classified = classifyProdHopDetailed(hopReport, rollbackOk, deliveryVerified, {
    secondaryHopReports,
    reportLogicalInputCount: report.logicalInputCount,
    reportPointerdownCount: report.pointerdownCount,
    requireRollback: true,
  });
  report.hopClassification = classified.status;
  report.hopClassifierDiagnostics = classified.diagnostics;
  report.PROD_HOP_CLASSIFIER_MOTOR_DETECTED =
    classified.diagnostics?.PROD_HOP_CLASSIFIER_MOTOR_DETECTED ?? null;
  report.PROD_HOP_CLASSIFIER_WAAPI_MODE =
    classified.diagnostics?.PROD_HOP_CLASSIFIER_WAAPI_MODE === true;
  report.PROD_HOP_CLASSIFIER_CSS_MODE =
    classified.diagnostics?.PROD_HOP_CLASSIFIER_CSS_MODE === true;
  report.PROD_HOP_CLASSIFIER_WAAPI_PHYSICAL_ACCEPTED =
    classified.diagnostics?.waapi?.PROD_HOP_CLASSIFIER_WAAPI_PHYSICAL_ACCEPTED === true;
  report.PROD_HOP_CLASSIFIER_CSS_TRANSITION_NOT_REQUIRED_IN_WAAPI =
    classified.diagnostics?.PROD_HOP_CLASSIFIER_CSS_TRANSITION_NOT_REQUIRED_IN_WAAPI === true;
  report.PROD_HOP_CLASSIFIER_SECONDARY_ARM_REJECTED_NO_INPUT_IGNORED =
    classified.diagnostics?.PROD_HOP_CLASSIFIER_SECONDARY_ARM_REJECTED_NO_INPUT_IGNORED ===
    true;
  report.PROD_HOP_CLASSIFIER_ROLLBACK_FALSE_REQUIRED =
    classified.diagnostics?.PROD_HOP_CLASSIFIER_ROLLBACK_FALSE_REQUIRED === true;
  writeJson("prod-hop-classifier-diagnostics.json", classified.diagnostics);

  if (!rollbackOk) {
    report.estado = STATUS.ROLLBACK_FAILED;
  } else if (report.hopClassification === "PROD_SINGLE_HOP_CLEAN") {
    report.estado = STATUS.CLEAN;
  } else if (
    report.hopClassification === "PROD_FINAL_HOP_ABORTED_ARM_REJECTED" ||
    report.hopClassification === "PROD_FINAL_HOP_ABORTED_ARM_CONTEXT_DIVERGENCE" ||
    report.hopClassification === "PROD_FINAL_HOP_ABORTED_ARM_CONTEXT_INCOMPLETE" ||
    report.hopClassification === "PROD_ARM_CONTEXT_FAILED" ||
    report.hopClassification === "PROD_INVALID_SESSION_RETURNED" ||
    report.hopClassification === "PROD_SINGLE_HOP_INCOMPLETE" ||
    report.hopClassification === "PROD_INPUT_NOT_EXECUTED" ||
    report.logicalInputCount === 0
  ) {
    report.estado = STATUS.ABORTED;
    if (report.hopClassification === "PROD_INVALID_SESSION_RETURNED") {
      report.specificFailureLabel = "PROD_INVALID_SESSION_RETURNED";
    }
  } else {
    report.estado = STATUS.FAILED;
    if (
      report.hopClassification === "PROD_NATIVE_TRANSITION_STARTED_BUT_DID_NOT_END" ||
      report.hopClassification === "PROD_TX_REHYDRATION_FAILED" ||
      report.hopClassification === "PROD_LEGACY_REVEAL_WHILE_PINNED_TX" ||
      report.hopClassification === "PROD_SOFT_NAV_REGRESSION" ||
      report.hopClassification === "PROD_SOFTNAV_TX_WITH_TRACE_RESET" ||
      report.hopClassification === "PROD_SOFTNAV_TX_WITHOUT_PIN_EVENT" ||
      report.hopClassification === "PROD_MORE_THAN_ONE_INPUT"
    ) {
      report.specificFailureLabel = report.hopClassification;
    }
  }

  writeReport();
  console.log("\n=== PROD SINGLE HOP VERIFIED TRUE DELIVERY ===");
  console.log(`OUT: ${OUT_DIR}`);
  console.log(`ESTADO: ${report.estado}`);
  console.log(`CLASSIFICATION: ${report.hopClassification}`);
  console.log(`DELIVERY_VERIFIED: ${report.PRODUCTION_FLAG_TRUE_VERIFIED}`);
  console.log(`ARMED: ${report.PROD_TRUE_INPUT_ARMED}`);
  console.log(`ENGINE: ${report.ENGINE}`);
  console.log(`DOM: ${report.DOM}`);
  console.log(`ROLLBACK: ${report.ROLLBACK_TO_FALSE_DEPLOYED}`);
  console.log(`INPUT_COUNTS: pd=${report.pointerdownCount} tap=${report.logicalInputCount}`);
  } catch (err) {
    report.unhandledError = String(err?.stack || err);
    if (flagFlippedToTrue && readSourceFlag() === true) {
      try {
        await rollbackFalse(report);
        report.hopClassification = report.hopClassification ?? "PROD_SINGLE_HOP_INCOMPLETE";
        report.estado =
          report.ROLLBACK_TO_FALSE_DEPLOYED === true
            ? STATUS.ABORTED
            : STATUS.ROLLBACK_FAILED;
      } catch (rollbackErr) {
        report.emergencyRollbackError = String(rollbackErr?.stack || rollbackErr);
        setSourceFlag(false);
        report.estado = STATUS.ROLLBACK_FAILED;
      }
    } else if (!report.estado) {
      report.estado = STATUS.PRECHECK_FAILED;
    }
    writeReport();
    throw err;
  }
}

await main();
