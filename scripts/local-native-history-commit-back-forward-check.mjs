/**
 * LOCAL_NATIVE_HISTORY_COMMIT_BACK_FORWARD_CHECK
 * Start /chats → history commit /shuffle → back → forward.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3010";
const OUT = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "scripts/ghost-filmstrip-out/history-back-forward-check";
const PROFILE = process.argv.includes("--profile")
  ? process.argv[process.argv.indexOf("--profile") + 1]
  : "scripts/.auth-capture-profile-chrome-diag";

fs.mkdirSync(OUT, { recursive: true });

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/1.0 wv";

function isPinActivelyBlocking(pin) {
  if (!pin) return false;
  const now =
    typeof performance !== "undefined"
      ? Math.round(performance.timeOrigin + performance.now())
      : Date.now();
  if (pin.expiresAtMono != null && now > pin.expiresAtMono) return false;
  return (
    pin.phase === "preparing" ||
    pin.phase === "armed" ||
    pin.phase === "sliding" ||
    pin.isSoftCommitInFlight === true
  );
}

async function snapshot(page, label) {
  return page.evaluate((lab) => {
    const soft =
      typeof window.__exportMicroSlideCommitNavDiag === "function"
        ? window.__exportMicroSlideCommitNavDiag() ?? []
        : Array.isArray(window.__microSlideCommitNavDiag)
          ? window.__microSlideCommitNavDiag
          : [];
    const softList = Array.isArray(soft) ? soft : soft?.events ?? soft?.entries ?? [];
    const pinRaw =
      typeof window.__getSoftCommitTxPin === "function"
        ? window.__getSoftCommitTxPin()
        : null;
    const tx =
      typeof window.__getMainTabToShuffleTransaction === "function"
        ? window.__getMainTabToShuffleTransaction()
        : null;
    const now = Math.round(performance.timeOrigin + performance.now());
    const pinActive = !!(
      pinRaw &&
      (pinRaw.expiresAtMono == null || now <= pinRaw.expiresAtMono) &&
      (pinRaw.phase === "preparing" ||
        pinRaw.phase === "armed" ||
        pinRaw.phase === "sliding" ||
        pinRaw.isSoftCommitInFlight === true)
    );
    const ring = (window.__mainTabToShuffleTraceExport?.() || []).slice(-16).map((e) => e.kind);
    return {
      label: lab,
      pathname: location.pathname,
      store:
        typeof window.__getMainTabInternalPathname === "function"
          ? window.__getMainTabInternalPathname()
          : null,
      txPhase: tx?.phase ?? null,
      pinActive,
      pinDiag: pinRaw
        ? {
            txId: pinRaw.txId,
            phase: pinRaw.phase,
            expiresAtMono: pinRaw.expiresAtMono,
            isSoftCommitInFlight: pinRaw.isSoftCommitInFlight,
          }
        : null,
      legacyReveal: softList.some((e) => e?.kind === "LEGACY_REVEAL_EXECUTED"),
      bottomNav:
        document.querySelector("[data-bottom-nav-active]")?.getAttribute("data-bottom-nav-active") ||
        document.querySelector('[aria-current="page"]')?.textContent?.trim() ||
        null,
      recentTraceKinds: ring,
    };
  }, label);
}

async function runWithContext(context) {
  const page = context.pages()[0] || (await context.newPage());

  await page.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);

  const before = await page.evaluate(() => ({
    pathname: location.pathname,
    store:
      typeof window.__getMainTabInternalPathname === "function"
        ? window.__getMainTabInternalPathname()
        : null,
  }));

  const shuffle = page.locator('.sayittome-bottom-nav [data-nav-tab="shuffle"]').first();
  await shuffle.waitFor({ state: "visible", timeout: 15000 });
  await shuffle.click({ timeout: 15000 });
  await page.waitForURL(/\/shuffle/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);

  const afterCommit = await page.evaluate(() => {
    const soft =
      typeof window.__exportMicroSlideCommitNavDiag === "function"
        ? window.__exportMicroSlideCommitNavDiag() ?? []
        : Array.isArray(window.__microSlideCommitNavDiag)
          ? window.__microSlideCommitNavDiag
          : [];
    const softList = Array.isArray(soft) ? soft : soft?.events ?? soft?.entries ?? [];
    const ring =
      typeof window.__mainTabToShuffleTraceExport === "function"
        ? window.__mainTabToShuffleTraceExport() ?? []
        : [];
    const all = [...softList, ...ring];
    const pinRaw =
      typeof window.__getSoftCommitTxPin === "function"
        ? window.__getSoftCommitTxPin()
        : null;
    const now = Math.round(performance.timeOrigin + performance.now());
    const pinActive = !!(
      pinRaw &&
      (pinRaw.expiresAtMono == null || now <= pinRaw.expiresAtMono) &&
      (pinRaw.phase === "preparing" ||
        pinRaw.phase === "armed" ||
        pinRaw.phase === "sliding" ||
        pinRaw.isSoftCommitInFlight === true)
    );
    return {
      pathname: location.pathname,
      store:
        typeof window.__getMainTabInternalPathname === "function"
          ? window.__getMainTabInternalPathname()
          : null,
      pushState: all.some(
        (e) =>
          e?.kind === "MICRO_SLIDE_HISTORY_PUSHSTATE_CALLED" ||
          e?.kind === "MICRO_SLIDE_HISTORY_URL_COMMITTED" ||
          e?.kind === "NAVIGATION_COMMIT_NOTIFIED",
      ),
      softPush: all.some((e) => e?.kind === "MICRO_SLIDE_SOFT_ROUTER_PUSH_CALLED"),
      pinActive,
      txPhase: window.__getMainTabToShuffleTransaction?.()?.phase ?? null,
    };
  });

  await page.waitForTimeout(500);
  await page
    .waitForFunction(() => {
      const tx = window.__getMainTabToShuffleTransaction?.() ?? null;
      const pin = window.__getSoftCommitTxPin?.() ?? null;
      const now = Math.round(performance.timeOrigin + performance.now());
      const pinActive = !!(
        pin &&
        (pin.expiresAtMono == null || now <= pin.expiresAtMono) &&
        (pin.phase === "preparing" ||
          pin.phase === "armed" ||
          pin.phase === "sliding" ||
          pin.isSoftCommitInFlight === true)
      );
      return (!tx || tx.phase === "idle" || tx.phase == null) && !pinActive;
    }, { timeout: 15000 })
    .catch(() => {});

  const settled = await snapshot(page, "settled");

  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const afterBack = await snapshot(page, "afterBack");

  await page.goForward({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const afterForward = await snapshot(page, "afterForward");

  await page.goto(`${BASE}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);
  const cold = await page.evaluate(() => {
    const ring = window.__mainTabToShuffleTraceExport?.() ?? [];
    const microSlideTx = ring.some(
      (e) =>
        e?.kind === "TRANSITION_BEGIN" ||
        e?.kind === "MICRO_SLIDE_WAAPI_MOTOR_SELECTED" ||
        e?.kind === "MICRO_SLIDE_HISTORY_PUSHSTATE_CALLED",
    );
    return {
      pathname: location.pathname,
      microSlideTx,
      datasetSlide: document.documentElement.getAttribute("data-main-tab-shuffle-slide"),
    };
  });

  const afterBackTraceHasTransitionBegin =
    Array.isArray(afterBack.recentTraceKinds) &&
    afterBack.recentTraceKinds.includes("TRANSITION_BEGIN");

  const backRetriggered =
    afterBackTraceHasTransitionBegin &&
    afterBack.pinActive === true &&
    (afterBack.txPhase == null || afterBack.txPhase === "idle");

  const pinGuardPass =
    !afterBackTraceHasTransitionBegin &&
    afterBack.pinActive !== true &&
    (afterBack.txPhase == null || afterBack.txPhase === "idle") &&
    afterForward.pinActive !== true;

  const report = {
    LOCAL_NATIVE_HISTORY_COMMIT_BACK_FORWARD_CHECK: true,
    before,
    afterCommit,
    settled,
    afterBack,
    afterForward,
    cold,
    classification: backRetriggered
      ? "HISTORY_BACK_RETRIGGERS_MICRO_SLIDE_PIN_WITHOUT_TX"
      : afterBackTraceHasTransitionBegin
        ? "HISTORY_BACK_TRANSITION_BEGIN_WITHOUT_USER_CLICK"
        : null,
    HISTORY_BACK_FORWARD_PIN_GUARD_PASS: pinGuardPass,
    NO_PIN_WITHOUT_ACTIVE_TX: pinGuardPass,
    checks: {
      startChats: before.pathname === "/chats" || before.pathname.startsWith("/chats"),
      commitShuffle: afterCommit.pathname === "/shuffle",
      historyPushState: afterCommit.pushState === true,
      noSoftPush: afterCommit.softPush !== true,
      backToSource: afterBack.pathname === "/chats" || afterBack.pathname.startsWith("/chats"),
      forwardToShuffle: afterForward.pathname === "/shuffle",
      storeUpdatesOnBack:
        afterBack.store == null ||
        afterBack.store === "/chats" ||
        String(afterBack.store).includes("chats"),
      storeUpdatesOnForward: afterForward.store == null || afterForward.store === "/shuffle",
      noTransitionBeginAfterBack: !afterBackTraceHasTransitionBegin,
      noStuckTx:
        (afterBack.txPhase == null || afterBack.txPhase === "idle") &&
        (afterForward.txPhase == null || afterForward.txPhase === "idle"),
      noStuckPin: afterBack.pinActive !== true && afterForward.pinActive !== true,
      pinGuardPass,
      coldUnaffected:
        cold.pathname === "/shuffle" && cold.microSlideTx !== true && cold.datasetSlide == null,
    },
  };

  report.PASS = Object.values(report.checks).every(Boolean);
  fs.writeFileSync(path.join(OUT, "history-back-forward-check.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.PASS) process.exitCode = 1;
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [`--user-agent=${UA}`],
});

try {
  if (fs.existsSync(PROFILE)) {
    await browser.close();
    const persistent = await chromium.launchPersistentContext(PROFILE, {
      channel: "chrome",
      headless: true,
      args: [`--user-agent=${UA}`, "--disable-blink-features=AutomationControlled"],
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: UA,
    });
    await runWithContext(persistent);
    await persistent.close();
    process.exit(process.exitCode ?? 0);
  }
} catch {
  /* fall through */
}

const context = await browser.newContext({
  userAgent: UA,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await runWithContext(context);
await browser.close();
process.exit(process.exitCode ?? 0);
