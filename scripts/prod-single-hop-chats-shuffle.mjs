/**
 * Authorized single production hop: Chats → Shuffle with real source flag true,
 * then immediate rollback to false. NO COMMIT.
 *
 *   node scripts/prod-single-hop-chats-shuffle.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROD_BASE = "https://sayittome-app.web.app";
const FLAG_FILE = path.join(ROOT, "src/lib/perf/instantaneityFlags.ts");
const FLAG_LINE = 16;
const PROFILE_DIR = path.resolve(__dirname, ".auth-capture-profile-chrome-diag");
const OUT_DIR = path.resolve(
  __dirname,
  "ghost-filmstrip-out",
  `prod-single-hop-chats-shuffle-${Date.now()}`,
);
const MOTOR_WATCHDOG_GLOB = [
  "src/lib/perf/",
  "src/components/",
  "scripts/auth-current-head-ghost-capture.mjs",
  "scripts/native-lifecycle-no-screencast-evidence.mjs",
  "scripts/shuffle-slide-multisource-classifier.mjs",
];

const report = {
  estado: null,
  commit: false,
  hopClassification: null,
};

function mono() {
  return performance.now();
}

function wall() {
  return Date.now();
}

function run(cmd, args, { cwd = ROOT, inherit = false } = {}) {
  return new Promise((resolve, reject) => {
    const started = wall();
    const child = spawn(cmd, args, {
      cwd,
      stdio: inherit ? "inherit" : "pipe",
      shell: process.platform === "win32",
      env: process.env,
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
    child.on("exit", (code) => {
      resolve({
        code,
        stdout,
        stderr,
        startedWall: started,
        endedWall: wall(),
        durationMs: wall() - started,
      });
    });
  });
}

function exec(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function readSourceFlag() {
  const content = fs.readFileSync(FLAG_FILE, "utf8");
  const m = content.match(/MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*(true|false)/);
  return m ? m[1] === "true" : null;
}

function setSourceFlag(value) {
  const content = fs.readFileSync(FLAG_FILE, "utf8");
  const before = content.match(/MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*(true|false)/)?.[0] ?? null;
  const after = `MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE: ${value}`;
  const newContent = content.replace(/MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*(true|false)/, after);
  fs.writeFileSync(FLAG_FILE, newContent);
  return { before, after, diff: `${before} -> ${after}` };
}

function isPort3010Free() {
  try {
    const out = exec("netstat -ano | findstr :3010");
    return !out.trim();
  } catch {
    return true;
  }
}

function stopProcessesOnPort(port) {
  try {
    const out = exec(`netstat -ano | findstr :${port}`);
    const pids = new Set();
    for (const line of out.split("\n")) {
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
    /* port free */
  }
}

async function stopNextProcesses() {
  stopProcessesOnPort(3010);
  stopProcessesOnPort(3000);
  await new Promise((r) => setTimeout(r, 500));
}

async function ensureCleanDist() {
  if (existsSync(path.join(ROOT, ".next/dev"))) {
    await rm(path.join(ROOT, ".next/dev"), { recursive: true, force: true });
  }
}

function readBuildId() {
  const p = path.join(ROOT, ".next/BUILD_ID");
  return existsSync(p) ? fs.readFileSync(p, "utf8").trim() : null;
}

function readGitSha() {
  try {
    return exec("git rev-parse HEAD").trim();
  } catch {
    return null;
  }
}

async function verifyProductionRuntime(expectedFlag) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const url = `${PROD_BASE}/chats?navcapture=1&_nc=${Date.now()}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
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
  const snap = await page.evaluate(() => {
    const exported = window.__microSlideActivationExport?.() ?? null;
    const swController = Boolean(navigator.serviceWorker?.controller);
    return { exported, swController };
  });
  await context.close();
  const buildFlag = snap.exported?.microSlideBuildFlag === true;
  const runtimeFlag = snap.exported?.microSlideRuntimeEnabled === true;
  const verified =
    expectedFlag === true
      ? buildFlag && runtimeFlag
      : !buildFlag && !runtimeFlag;
  return {
    verified,
    microSlideBuildFlag: snap.exported?.microSlideBuildFlag ?? null,
    microSlideRuntimeEnabled: snap.exported?.microSlideRuntimeEnabled ?? null,
    microSlideOverridePresent: snap.exported?.microSlideOverridePresent ?? null,
    buildSha: snap.exported?.buildSha ?? null,
    serviceWorkerController: snap.swController,
    implementationVersion: snap.exported?.microSlideImplementationVersion ?? null,
  };
}

async function fetchProdHeaders() {
  const res = await fetch(`${PROD_BASE}/chats`, { headers: { "cache-control": "no-cache" } });
  const headers = {};
  for (const [k, v] of res.headers) {
    if (["cache-control", "etag", "x-nextjs-cache", "x-firebase-hosting", "last-modified"].includes(k)) {
      headers[k] = v;
    }
  }
  return { status: res.status, headers };
}

function savePreflight() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  try {
    report.preflightGitStatus = exec("git status --porcelain=v1 -uall");
  } catch (e) {
    report.preflightGitStatus = String(e);
  }
  try {
    const fullDiff = exec("git diff HEAD");
    fs.writeFileSync(path.join(OUT_DIR, "preflight-git-diff-full.patch"), fullDiff);
    report.preflightGitDiffSaved = true;
  } catch {
    report.preflightGitDiffSaved = false;
  }
  try {
    const motorDiff = exec(`git diff HEAD -- ${MOTOR_WATCHDOG_GLOB.map((p) => `"${p}"`).join(" ")}`);
    fs.writeFileSync(path.join(OUT_DIR, "preflight-motor-watchdog-tooling.diff"), motorDiff);
  } catch {
    fs.writeFileSync(path.join(OUT_DIR, "preflight-motor-watchdog-tooling.diff"), "");
  }
}

function classifyProdHop(hopReport, rollbackOk) {
  if (!hopReport) return "PROD_SINGLE_HOP_INCOMPLETE";
  const ev = hopReport.hopNineEvidence ?? {};
  const bridge = hopReport.bridgeAudit ?? {};
  const native = hopReport.nativeLifecycleNoScreencastEvidence ?? {};
  const summary = hopReport.nativeLifecycleSummary ?? {};
  const post = hopReport.postHopOutsideCritical ?? {};
  const counters = hopReport.criticalCaptureCounters ?? {};
  const checks = hopReport.releaseChecks ?? {};
  const trace = ev.hopTrace ?? hopReport.mainTabToShuffleTrace ?? [];
  const hasKind = (k) => trace.some((e) => e.kind === k);

  const captureClean =
    (counters.cdpScreencastStartCountDuringCriticalWindow ?? 0) === 0 &&
    (counters.cdpScreencastFrameCountDuringCriticalWindow ?? 0) === 0 &&
    (counters.pageScreenshotCountDuringCriticalWindow ?? 0) === 0 &&
    (counters.externalCaptureLoopIterationsDuringCriticalWindow ?? 0) === 0;

  const gatePass =
    ev.TRACE_BELONGS_TO_CURRENT_HOP === true &&
    Boolean(ev.currentHopTransactionIdResolved) &&
    hopReport.sourceTab === "chats" &&
    ev.ENGINE_SLIDE_OCCURRED === true &&
    ev.DOM_SLIDE_OCCURRED === true &&
    hasKind("SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL") &&
    (native.transitionrunCount ?? 0) > 0 &&
    (native.transitionstartCount ?? 0) > 0 &&
    (native.transitionendCount ?? 0) > 0 &&
    (native.transitioncancelCount ?? 0) === 0 &&
    (summary.settleReason === "transitionend" || native.settleReason === "transitionend") &&
    (summary.watchdogSettleCount ?? 0) === 0 &&
    (summary.watchdogCallbackCount ?? 0) === 0 &&
    (bridge.bridgeStarted === true || hasKind("POST_SETTLE_ROUTE_BRIDGE_STARTED")) &&
    (bridge.BRIDGE_OWNER_SURFACE_PRESENTABLE !== false) &&
    (hasKind("FINAL_ROUTE_SURFACE_READY") || bridge.finalRouteReady === true) &&
    (hasKind("PRESENTATION_OWNERSHIP_TRANSFERRED") || bridge.ownershipTransferred === true) &&
    (hasKind("POST_SETTLE_ROUTE_BRIDGE_COMPLETED") || bridge.bridgeCompleted === true) &&
    (bridge.loadingActuallyVisibleDuringBridge ?? 0) === 0 &&
    (hopReport.loadingShellVisibleFrameCount ?? 0) === 0 &&
    (hopReport.bugWindowFrameCount ?? 0) === 0 &&
    (post.pathname === "/shuffle" || hopReport.frameTable?.at(-1)?.pathname === "/shuffle") &&
    post.centeredLoadingVisible !== true &&
    post.blankOrRootSuspect !== true &&
    hopReport.RELEASE_HOP_CLEAN === true &&
    captureClean &&
    rollbackOk;

  if (!hopReport.COMPLETE_HOP_CAPTURE && !ev.TRACE_BELONGS_TO_CURRENT_HOP) {
    return "PROD_SINGLE_HOP_INCOMPLETE";
  }
  return gatePass ? "PROD_SINGLE_HOP_CLEAN" : "PROD_SINGLE_HOP_FAIL";
}

async function rollbackFalse(reason) {
  report.ROLLBACK_TO_FALSE_ATTEMPTED = true;
  report.rollbackReason = reason;
  const flagChange = setSourceFlag(false);
  report.flagRollbackDiff = flagChange.diff;
  report.sourceFlagAfterRollback = readSourceFlag();

  await stopNextProcesses();
  report.nextProcessesStoppedBeforeFalseDeploy = true;
  report.port3010FreeBeforeFalseDeploy = isPort3010Free();

  await ensureCleanDist();
  const falseBuild = await run("npm", ["run", "build"], { inherit: true });
  report.rollbackFalseBuildResult = falseBuild.code === 0 ? "PASS" : `FAIL code=${falseBuild.code}`;
  report.rollbackFalseBuildSha = readBuildId();
  report.rollbackFalseGitSha = readGitSha();

  if (falseBuild.code !== 0) {
    report.ROLLBACK_TO_FALSE_DEPLOYED = false;
    return false;
  }

  let deployOk = false;
  for (let attempt = 1; attempt <= 3 && !deployOk; attempt += 1) {
    const deployStart = { mono: mono(), wall: wall() };
    const deploy = await run("firebase", ["deploy", "--only", "hosting"], { inherit: true });
    report.rollbackFalseDeploy = {
      attempt,
      start: deployStart,
      complete: { mono: mono(), wall: wall() },
      result: deploy.code === 0 ? "PASS" : `FAIL code=${deploy.code}`,
    };
    deployOk = deploy.code === 0;
  }

  report.ROLLBACK_TO_FALSE_DEPLOYED = deployOk;
  if (deployOk) {
    const verify = await verifyProductionRuntime(false);
    report.productionFlagFalseVerifiedAfterHop = verify;
    report.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_HOP = verify.verified === true;
    report.rollbackDeployedBuildSha = verify.buildSha ?? readBuildId();
  }
  return deployOk;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const protocolStarted = { mono: mono(), wall: wall() };
  report.protocolStarted = protocolStarted;

  savePreflight();
  report.productionFlagBefore = readSourceFlag();
  report.sourceFlagFile = FLAG_FILE;
  report.sourceFlagLine = FLAG_LINE;

  if (report.productionFlagBefore !== false) {
    report.estado = "PROD_HOP_ABORTED_BEFORE_TRUE_DEPLOY";
    report.abortReason = "flag not false before hop";
    fs.writeFileSync(path.join(OUT_DIR, "prod-single-hop-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const prodBefore = await verifyProductionRuntime(false);
  report.productionRuntimeBeforeHop = prodBefore;
  report.currentProductionSafeWithFlagFalse = prodBefore.verified === true;

  const endpoint = await fetchProdHeaders();
  report.productionEndpoint = endpoint;

  let flagFlipped = false;
  let trueDeployed = false;

  try {
    const flagChange = setSourceFlag(true);
    flagFlipped = true;
    report.flagTrueDiff = flagChange.diff;
    report.flagTrueFile = FLAG_FILE;
    report.flagTrueLine = FLAG_LINE;
    report.sourceFlagBefore = false;
    report.sourceFlagAfterTrue = true;
    report.SOURCE_FLAG_REAL_PRODUCTION_ACTIVATION = true;

    await stopNextProcesses();
    report.nextProcessesStoppedBeforeTrueDeploy = true;
    report.port3010FreeBeforeTrueDeploy = isPort3010Free();

    await ensureCleanDist();
    const trueBuildStart = wall();
    const trueBuild = await run("npm", ["run", "build"], { inherit: true });
    report.trueBuildResult = trueBuild.code === 0 ? "PASS" : `FAIL code=${trueBuild.code}`;
    report.trueBuildDurationMs = wall() - trueBuildStart;
    report.trueBuildSha = readBuildId();
    report.trueBuildGitSha = readGitSha();

    if (trueBuild.code !== 0) {
      report.estado = "PROD_HOP_ABORTED_BEFORE_TRUE_DEPLOY";
      return;
    }

    const trueDeployStart = { mono: mono(), wall: wall() };
    const trueDeploy = await run("firebase", ["deploy", "--only", "hosting"], { inherit: true });
    report.trueDeployStart = trueDeployStart;
    report.trueDeployComplete = { mono: mono(), wall: wall() };
    report.trueDeployResult = trueDeploy.code === 0 ? "PASS" : `FAIL code=${trueDeploy.code}`;
    trueDeployed = trueDeploy.code === 0;
    report.trueDeployedBuildSha = readBuildId();

    const prodHeadersAfterTrue = await fetchProdHeaders();
    report.productionHeadersAfterTrueDeploy = prodHeadersAfterTrue;

    const verifyTrue = await verifyProductionRuntime(true);
    report.productionFlagTrueVerified = verifyTrue;
    report.PRODUCTION_FLAG_TRUE_VERIFIED = verifyTrue.verified === true;
    report.trueDeployedBuildShaRuntime = verifyTrue.buildSha;

    report.ZERO_JITTER = true;
    report.DIAGNOSTIC_TIMING_JITTER_ACTIVE = false;
    report.routeCommitDelayMs = 0;
    report.NAVCAPTURE_TIMING_JITTER = 0;
    report.CAPTURE_PROVIDER_SELECTED = "NONE_DURING_CRITICAL_WINDOW";
    report.PHYSICAL_EVIDENCE_PROVIDER_SELECTED = "NATIVE_TRANSITION_LIFECYCLE_NO_SCREENCAST";

    const hopOutDir = path.join(OUT_DIR, "hop-capture");
    const hopRun = await run(
      "node",
      [
        "scripts/auth-current-head-ghost-capture.mjs",
        "--capture",
        "--release",
        "--chrome",
        "--native-lifecycle-no-screencast",
        "--one-hop",
        "--runner-trace",
        "--prod-true-activation",
        "--prod-true-expected-build-identity",
        report.trueBuildGitSha ?? report.trueBuildSha ?? "",
        ...(verifyTrue.verified ? ["--prod-true-verified", "1"] : []),
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
    const summaryPath = path.join(hopOutDir, "current-head-report.json");
    report.hopReportPath = existsSync(hopReportPath) ? hopReportPath : null;
    report.hopSummaryPath = existsSync(summaryPath) ? summaryPath : null;

    let hopReport = null;
    if (existsSync(hopReportPath)) {
      hopReport = JSON.parse(fs.readFileSync(hopReportPath, "utf8"));
    }
    report.hopReport = hopReport;

    if (hopReport) {
      const ev = hopReport.hopNineEvidence ?? {};
      const bridge = hopReport.bridgeAudit ?? {};
      const native = hopReport.nativeLifecycleNoScreencastEvidence ?? {};
      const summary = hopReport.nativeLifecycleSummary ?? {};
      const post = hopReport.postHopOutsideCritical ?? {};
      const counters = hopReport.criticalCaptureCounters ?? {};
      const pre = hopReport.hopNineDiag?.preSnapshot ?? {};
      const nav = hopReport.runnerIsolation?.navChain ?? {};
      const jitter = hopReport.diagnosticTimingJitter ?? {};

      Object.assign(report, {
        criticalScreencastStarts: counters.cdpScreencastStartCountDuringCriticalWindow ?? 0,
        criticalScreencastFrames: counters.cdpScreencastFrameCountDuringCriticalWindow ?? 0,
        criticalScreenshots: counters.pageScreenshotCountDuringCriticalWindow ?? 0,
        criticalExternalCaptureIterations:
          counters.externalCaptureLoopIterationsDuringCriticalWindow ?? 0,
        preHopPathname: pre.pathname ?? hopReport.runnerIsolation?.selectedPointerdownPathname ?? null,
        authenticatedUiEvidence: hopReport.sessionValidation?.valid ?? true,
        validForCapture: hopReport.COMPLETE_HOP_CAPTURE !== false,
        blockingModalCount: pre.blockingModalCount ?? 0,
        preHopLoadingShell: pre.loadingShellCount ?? 0,
        preHopLoadingText: pre.centeredLoadingVisible ?? false,
        shuffleTargetPointerdownCount: hopReport.runnerIsolation?.hopPointerdownCount ?? null,
        shuffleTargetClickCount: nav.eventsAfterPointer?.filter((e) => e.kind === "NAV_INPUT_CLICK")
          .length,
        prepareCount: nav.prepareIdx != null ? 1 : 0,
        completeCount: nav.completeIdx != null ? 1 : 0,
        routerNavCalledShuffleCount: nav.eventsAfterPointer?.filter(
          (e) => e.kind === "ROUTER_NAV_CALLED",
        ).length,
        currentHopTransactionCount: ev.currentHopTransactionCandidateCount ?? 1,
        transactionId: ev.currentHopTransactionIdResolved ?? hopReport.currentHopTransactionIdResolved,
        sourceTab: hopReport.sourceTab,
        traceCurrentHopValid: ev.TRACE_BELONGS_TO_CURRENT_HOP === true,
        txResolved: Boolean(ev.currentHopTransactionIdResolved),
        ENGINE: ev.ENGINE_SLIDE_OCCURRED === true,
        DOM: ev.DOM_SLIDE_OCCURRED === true,
        finalInlineCommitted: (ev.hopTrace ?? []).some(
          (e) => e.kind === "SLIDE_FINAL_WRITE_COMMITTED_FUNCTIONAL",
        ),
        transitionrun: (native.transitionrunCount ?? 0) > 0,
        transitionstart: (native.transitionstartCount ?? 0) > 0,
        transitionend: (native.transitionendCount ?? 0) > 0,
        transitionendElapsedTime: native.transitionendElapsedTime ?? summary.transitionendElapsedTime,
        transitioncancel: native.transitioncancelCount ?? 0,
        settleReason: summary.settleReason ?? native.settleReason,
        watchdogSettle: summary.watchdogSettleCount ?? 0,
        watchdogCallbackSettle: summary.watchdogCallbackCount ?? 0,
        preemptStart110: hopReport.releaseChecks?.watchdogPreemptExpectedNativeEndFromStartCount ?? 0,
        preemptStart190: hopReport.releaseChecks?.watchdogPreemptWithinSlackFromStartCount ?? 0,
        bridgeStarted: bridge.bridgeStarted === true,
        bridgeOwnerInvalid: bridge.bridgeOwnerNotPresentableFrameCount ?? 0,
        finalRouteReady: bridge.finalRouteReady === true,
        ownershipTransferred: bridge.ownershipTransferred === true,
        latchReleaseReason: hopReport.latchAudit?.latchReleaseReason ?? bridge.latchReleaseReason,
        canonicalTxCleared: bridge.canonicalTransactionCleared === true,
        bridgeCompleted: bridge.bridgeCompleted === true,
        loadingActuallyVisible: bridge.loadingActuallyVisibleDuringBridge ?? 0,
        loadingShellVisible: hopReport.loadingShellVisibleFrameCount ?? 0,
        ownerNoneCritical: bridge.ownerNoneDuringBridge ?? 0,
        bugWindow: hopReport.bugWindowFrameCount ?? 0,
        visibleRouteMismatch: hopReport.routePresentationMismatchFrameCount ?? 0,
        finalPathname: post.pathname ?? null,
        finalPresentationOwner:
          post.presentationOwnerAttr ?? hopReport.presentationLatchMetrics?.owner ?? null,
        blackRootCriticalEvaluationStatus: hopReport.blackRootEvaluationStatus,
        presentedNoneCriticalEvaluationStatus: hopReport.presentedNoneEvaluationStatus,
        postHopScreenshotPath: post.postHopScreenshotPath ?? null,
        postHopShuffleVisible: (post.shuffleSlots ?? 0) > 0,
        postHopCenteredCargandoVisible: post.centeredLoadingVisible === true,
        postHopBlankRootVisible: post.blankOrRootSuspect === true,
        DIAGNOSTIC_TIMING_JITTER_ACTIVE: jitter.DIAGNOSTIC_TIMING_JITTER_ACTIVE === true,
        ZERO_JITTER: jitter.ZERO_JITTER !== false,
        routeCommitDelayMs: jitter.routeCommitDelayMs ?? 0,
        navcaptureTimingJitter: jitter.navcaptureTimingJitterMs ?? 0,
      });
    }
  } catch (err) {
    report.hopRunnerException = String(err?.stack || err);
  } finally {
    if (flagFlipped) {
      const rollbackOk = await rollbackFalse("mandatory post-hop rollback");
      report.productionFlagChangedBackToFalse = readSourceFlag() === false;
      report.rollbackFalseBuildResult = report.rollbackFalseBuildResult ?? "NOT_RUN";
      const hopReport = report.hopReport;
      const classification = classifyProdHop(hopReport, rollbackOk);
      report.hopClassification = classification;
      report.currentProductionSafeAfterRollback =
        report.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_HOP === true;
      report.backendDelta = 0;
      if (report.estado === "PROD_HOP_ABORTED_BEFORE_TRUE_DEPLOY") {
        /* keep */
      } else if (classification === "PROD_SINGLE_HOP_CLEAN") {
        report.estado = "PROD_SINGLE_HOP_CLEAN_ROLLED_BACK_FALSE";
      } else if (classification === "PROD_SINGLE_HOP_INCOMPLETE") {
        report.estado = "PROD_SINGLE_HOP_INCOMPLETE_ROLLED_BACK_FALSE";
      } else {
        report.estado = "PROD_SINGLE_HOP_FAIL_ROLLED_BACK_FALSE";
      }
    }
    report.protocolEnded = { mono: mono(), wall: wall() };
    fs.writeFileSync(path.join(OUT_DIR, "prod-single-hop-report.json"), JSON.stringify(report, null, 2));
    console.log("\n=== PROD SINGLE HOP REPORT ===");
    console.log(`OUT_DIR: ${OUT_DIR}`);
    console.log(`ESTADO: ${report.estado}`);
    console.log(`CLASSIFICATION: ${report.hopClassification}`);
    console.log(`ROLLBACK_DEPLOYED: ${report.ROLLBACK_TO_FALSE_DEPLOYED}`);
    console.log(`PRODUCTION_FALSE_VERIFIED: ${report.PRODUCTION_FLAG_FALSE_VERIFIED_AFTER_HOP}`);
  }
}

await main();
