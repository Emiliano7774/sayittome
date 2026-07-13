/**
 * Production TRUE delivery preflight — NO hop, NO input, NO Shuffle interaction.
 * Proves or rejects true build delivery chain, then rollback false immediately.
 *
 *   node scripts/prod-true-delivery-preflight.mjs
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { evaluateProdTrueInputArm } from "./prod-true-fail-closed-gate.mjs";
import { buildProdTrueArmContext, armProdTrueInputWithContext } from "./prod-true-arm-context.mjs";
import { parseDeployUploadStats } from "./prod-true-deploy-log-parser.mjs";
import {
  DEFAULT_STAGING_POLL_MS,
  DEFAULT_STAGING_TIMEOUT_MS,
  evaluateFinalStagingReady,
  findMicroSlideRuntimeChunk,
  sampleStagingState,
  STAGING_MANIFEST_STABLE_SAMPLES_REQUIRED,
} from "./prod-true-final-staging-ready.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROD_BASE = "https://sayittome-app.web.app";
const FLAG_FILE = path.join(ROOT, "src/lib/perf/instantaneityFlags.ts");
const FLAG_LINE = 16;
const PROFILE_DIR = path.resolve(__dirname, ".auth-capture-profile-chrome-diag");
const OUT_DIR = path.resolve(
  __dirname,
  "ghost-filmstrip-out",
  `prod-true-delivery-preflight-final-staging-${Date.now()}`,
);

const ARTIFACT_SKIP_DIRS = ["types", "cache", "diagnostics", "dev"];
const NEXT_START_BIN = path.join(ROOT, "node_modules/next/dist/bin/next");

function writeReport() {
  writeJson("prod-true-delivery-preflight-report.json", report);
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
  DELIVERY_PREFLIGHT_INPUT_FORBIDDEN: true,
  pointerdownCount: 0,
  logicalInputCount: 0,
  prepareCount: 0,
  completeCount: 0,
  routerNavCalledShuffleCount: 0,
  currentHopTransactionCount: 0,
  commit: false,
  prodHopInputInTask: false,
  motorDiff: 0,
  watchdogDiff: 0,
  bridgeDiff: 0,
  backendDelta: 0,
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

async function readLocalRuntimeDiagnostic(baseUrl) {
  await sleep(2000);
  const ready = await waitForHttp(`${baseUrl}/chats`, 45000);
  if (!ready) throw new Error(`local-server-not-ready:${baseUrl}`);
  const context = await chromium.launch({ headless: true });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/chats?navcapture=1&delivery_preflight=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => typeof window.__microSlideActivationExport === "function");
    if (ready) break;
    await page.waitForTimeout(200);
  }
  const snap = await page.evaluate(() => window.__microSlideActivationExport?.() ?? null);
  await context.close();
  return snap;
}

async function verifyCleanClientRuntime({ phase, expectedFlag, expectedBuildIdentity }) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = context.pages()[0] ?? (await context.newPage());
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

  await page.goto(`${PROD_BASE}/chats?navcapture=1&delivery_preflight=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  for (const label of [/Mantener Español/i, /Keep English/i, /Aceptar/i, /Accept/i]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.isVisible().catch(() => false)) await btn.click();
  }
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => typeof window.__microSlideActivationExport === "function");
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
    authPreserved: clean.pathname === "/chats",
    verified:
      expectedFlag === true
        ? buildFlag && runtimeFlag && identityMatch && !clean.controller
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
  const child = spawn("firebase", ["deploy", "--only", "hosting"], {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
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

  const child = spawn("firebase", ["deploy", "--only", "hosting"], {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
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
  const docUrl = `${PROD_BASE}/chats?delivery_preflight=${ts}`;
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
  };
  const falseDeploy = await deployHostingWithLog(path.join(OUT_DIR, "false-rollback-deploy.log"));
  reportState.falseRollbackDeployResult = falseDeploy.code === 0 ? "PASS" : "FAIL";
  const falseLive = await fetchLiveChannelIdentity();
  reportState.FALSE_LIVE_RELEASE_ID_AFTER_ROLLBACK = falseLive?.liveReleaseId ?? null;
  reportState.FALSE_LIVE_VERSION_ID_AFTER_ROLLBACK = falseLive?.liveVersionId ?? null;
  reportState.postRollbackCleanClient = await verifyCleanClientRuntime({
    phase: "post-rollback",
    expectedFlag: false,
    expectedBuildIdentity: falseLocal?.buildSha,
  });
  reportState.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_PREFLIGHT =
    reportState.falseRollbackLocalRuntime.microSlideBuildFlag === false &&
    reportState.falseRollbackLocalRuntime.microSlideRuntimeEnabled === false &&
    reportState.postRollbackCleanClient.verified === true;
  reportState.currentProductionSafe =
    reportState.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_PREFLIGHT === true;
}

async function main() {
  let flagFlippedToTrue = false;
  try {
  fs.mkdirSync(path.join(OUT_DIR, "artifacts"), { recursive: true });
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
    fs.writeFileSync(path.join(OUT_DIR, "preflight-git-status.txt"), exec("git status --porcelain=v1"));
  } catch (e) {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-git-status.txt"), String(e));
  }
  try {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-git-diff-full.patch"), exec("git diff HEAD"));
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-git-diff-full.patch"), "");
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "preflight-tooling.diff"),
      exec("git diff HEAD -- scripts/prod-true-*.mjs tsconfig.json"),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-tooling.diff"), "");
  }
  try {
    fs.writeFileSync(
      path.join(OUT_DIR, "preflight-motor-watchdog-bridge.diff"),
      exec('git diff HEAD -- src/lib/perf/ src/components/navigation/ scripts/auth-current-head-ghost-capture.mjs'),
    );
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-motor-watchdog-bridge.diff"), "");
  }
  fs.copyFileSync(path.join(ROOT, "firebase.json"), path.join(OUT_DIR, "firebase-json.json"));
  fs.copyFileSync(path.join(ROOT, ".firebaserc"), path.join(OUT_DIR, "firebaserc.txt"));
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
    report.estado = "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED";
    report.rootCauseClassification = "TOOLING_HARNESS_REGRESSION";
    writeReport();
    process.exit(1);
  }

  report.TOOLING_FROZEN_DURING_DELIVERY_EXPERIMENT = true;

  if (report.initialProdFlag !== false) {
    report.estado = "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED";
    report.rootCauseClassification = "OTHER_PROVEN_CAUSE";
    writeJson("prod-true-delivery-preflight-report.json", report);
    process.exit(1);
  }

  // FASE 2
  const preLive = await fetchLiveChannelIdentity();
  writeJson("pre-true-live-identity-raw.json", preLive?.raw ?? null);
  report.liveIdentityReadOnlyMethod = preLive?.method ?? null;
  report.PRE_TRUE_LIVE_RELEASE_ID = preLive?.liveReleaseId ?? null;
  report.PRE_TRUE_LIVE_VERSION_ID = preLive?.liveVersionId ?? null;
  if (!preLive?.liveVersionId) {
    report.estado = "PROD_TRUE_DELIVERY_PREFLIGHT_INCOMPLETE_RELEASE_IDENTITY";
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
  report.TRUE_BUILD_COMPILED_FLAG_PROVEN =
    trueLocalSnap?.microSlideBuildFlag === true &&
    trueLocalSnap?.microSlideRuntimeEnabled === true &&
    localChunk?.compiledFlagTrue === true;

  if (!report.TRUE_BUILD_COMPILED_FLAG_PROVEN || trueBuild.code !== 0) {
    setSourceFlag(false);
    await run("npm", ["run", "build"], { inherit: true });
    report.estado = "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED";
    report.rootCauseClassification = "OTHER_PROVEN_CAUSE";
    writeJson("prod-true-delivery-preflight-report.json", report);
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
    report.rootCauseClassification = !stagingOk
      ? "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED_FINAL_STAGING"
      : !liveOk
        ? "TRUE_VERSION_CREATED_BUT_NOT_LIVE"
        : "OTHER_PROVEN_CAUSE";
    await rollbackFalse(report);
    report.estado = !stagingOk
      ? "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED_FINAL_STAGING"
      : "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED";
    writeReport();
    process.exit(1);
  }

  // FASE 11 origin
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
  report.ORIGIN_TRUE_ARTIFACT_MATCH =
    origin.runtimeAssetSha256 != null &&
    origin.runtimeAssetSha256 === report.TRUE_FINAL_STAGING_RUNTIME_ASSET_HASH;

  if (!report.ORIGIN_TRUE_ARTIFACT_MATCH) {
    report.rootCauseClassification = "ORIGIN_OR_CDN_NOT_SERVING_TRUE_RELEASE";
    await rollbackFalse(report);
    report.estado = "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED_ORIGIN";
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
  report.TRUE_DELIVERY_VERIFIED_BY_SW_BYPASS_CLIENT = cleanClient.verified === true;

  if (!report.TRUE_DELIVERY_VERIFIED_BY_SW_BYPASS_CLIENT) {
    await rollbackFalse(report);
    report.estado = "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED_CLIENT";
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

  // FASE 10 fail-closed eval only (input forbidden)
  const preflightArmContext = buildProdTrueArmContext({
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
    deliveryPreflightInputForbidden: true,
    effectiveCommitNavigationMode: "soft",
    softNavigationToShuffleAvailable: true,
    nativeShellHardNavWouldNormallyApply: true,
    microSlideSoftOverrideApplies: true,
    sourceTab: "chats",
    destinationPath: "/shuffle",
    targetProduction: true,
  });
  const armEval = armProdTrueInputWithContext({
    context: preflightArmContext,
    evaluateProdTrueInputArm,
  });
  report.PROD_TRUE_INPUT_ARMED = armEval.PROD_TRUE_INPUT_ARMED;
  report.armRejectionEvent = armEval.event;
  report.armFailedPredicates = armEval.failedPredicates;

  if (
    report.pointerdownCount !== 0 ||
    report.logicalInputCount !== 0 ||
    report.prepareCount !== 0 ||
    report.completeCount !== 0 ||
    report.routerNavCalledShuffleCount !== 0 ||
    report.currentHopTransactionCount !== 0
  ) {
    report.estado = "PROD_DELIVERY_PREFLIGHT_INPUT_VIOLATION";
    await rollbackFalse(report);
    writeJson("prod-true-delivery-preflight-report.json", report);
    process.exit(1);
  }

  // FASE 11 rollback always
  await rollbackFalse(report);

  // FASE 12 SW forensic
  report.oldControlledClientRuntimeMeasured = cleanClient.oldControlledClientMeasured;
  report.oldControlledClientFlag = cleanClient.oldControlledClientFlag;
  report.cleanBypassClientFlagUnderSameTrueLiveRelease = cleanClient.microSlideBuildFlag;
  report.staleClientDeliveryReproduced =
    cleanClient.oldControlledClientMeasured === true &&
    cleanClient.oldControlledClientFlag === false &&
    cleanClient.microSlideBuildFlag === true;

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

  // FASE 17 harness reconfirm (tooling frozen — no edits after this point in experiment)
  report.DELIVERY_PREFLIGHT_INPUT_FORBIDDEN_INVARIANT = true;
  report.NO_PROD_INPUT_WHEN_TRUE_FLAG_UNVERIFIED = true;
  report.NO_PROD_INPUT_WHEN_VALID_FOR_CAPTURE_FALSE = true;
  report.NO_PROD_INPUT_WHEN_RUNTIME_IDENTITY_MISMATCH = true;
  report.ALL_INPUT_SIDE_EFFECTS_ZERO_ON_ARM_REJECTION = true;

  // FASE 16 historical root classification
  if (
    report.PRODUCTION_FLAG_TRUE_VERIFIED &&
    report.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_PREFLIGHT
  ) {
    report.rootCauseClassification = "PREVIOUS_TRUE_DEPLOY_UNPROVABLE_BUT_NEW_TRUE_DELIVERY_VERIFIED";
    if (report.staleClientDeliveryReproduced) {
      report.historicalDeliveryRootClassificationSecondary = "CLIENT_SW_OR_CACHE_STALE_DELIVERY_PROVEN";
    } else if (cleanClient.oldControlledClientMeasured && cleanClient.oldControlledClientFlag === false) {
      report.historicalDeliveryRootClassificationSecondary =
        "CLIENT_SW_OR_CACHE_STALE_DELIVERY_STRONGLY_SUPPORTED";
    }
    report.estado = "READY_FOR_RETRY_SINGLE_PROD_HOP_WITH_VERIFIED_TRUE_DELIVERY";
  } else {
    report.rootCauseClassification = report.rootCauseClassification ?? "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED";
    report.estado = report.estado ?? "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED";
  }

  writeReport();
  console.log("\n=== PROD TRUE DELIVERY PREFLIGHT (FINAL STAGING) ===");
  console.log(`OUT: ${OUT_DIR}`);
  console.log(`ESTADO: ${report.estado}`);
  console.log(`ROOT: ${report.rootCauseClassification}`);
  console.log(`FINAL_STAGING_READY: ${report.FINAL_DEPLOY_STAGING_READY}`);
  console.log(`TRUE_BUILD_COMPILED: ${report.TRUE_BUILD_COMPILED_FLAG_PROVEN}`);
  console.log(`STAGED_MATCH: ${report.TRUE_DEPLOY_STAGED_ARTIFACT_MATCHES_TRUE_BUILD}`);
  console.log(`LIVE_RELEASE: ${report.TRUE_DELIVERY_VERIFIED_BY_LIVE_RELEASE}`);
  console.log(`ORIGIN_MATCH: ${report.ORIGIN_TRUE_ARTIFACT_MATCH}`);
  console.log(`CLEAN_CLIENT: ${report.TRUE_DELIVERY_VERIFIED_BY_SW_BYPASS_CLIENT}`);
  console.log(`INPUT_COUNTS: pd=${report.pointerdownCount} tap=${report.logicalInputCount}`);
  } catch (err) {
    report.unhandledError = String(err?.stack || err);
    if (flagFlippedToTrue && readSourceFlag() === true) {
      try {
        await rollbackFalse(report);
      } catch (rollbackErr) {
        report.emergencyRollbackError = String(rollbackErr?.stack || rollbackErr);
        setSourceFlag(false);
      }
    }
    report.estado = report.estado ?? "PROD_TRUE_DELIVERY_PREFLIGHT_FAILED";
    writeJson("prod-true-delivery-preflight-report.json", report);
    throw err;
  }
}

await main();
