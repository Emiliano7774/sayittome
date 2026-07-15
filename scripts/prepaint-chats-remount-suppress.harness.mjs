/**
 * Static + optional live harnesses for pre-paint Chats remount suppress fix.
 * Run: node scripts/prepaint-chats-remount-suppress.harness.mjs [--live --base http://127.0.0.1:3010]
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const live = args.includes("--live");
const base = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : "http://127.0.0.1:3010";

const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const suppress = fs.readFileSync(
  path.join(root, "src/lib/chats/chatsHandoffSuppress.ts"),
  "utf8",
);
const prepaint = fs.readFileSync(
  path.join(root, "src/lib/chats/chatsPrepaintHandoff.ts"),
  "utf8",
);
const bootstrap = fs.readFileSync(
  path.join(root, "src/lib/chats/chatsPrepaintBootstrapInline.ts"),
  "utf8",
);
const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const nav = fs.readFileSync(
  path.join(root, "src/components/navigation/BottomNavLink.tsx"),
  "utf8",
);
const shuffle = fs.readFileSync(
  path.join(root, "src/lib/navigation/shuffleHandoffState.ts"),
  "utf8",
);
const inbox = fs.readFileSync(
  path.join(root, "src/hooks/useChatsInboxReady.ts"),
  "utf8",
);
const probe = fs.readFileSync(
  path.join(root, "scripts/bidirectional-tab-no-loading-local-probe.mjs"),
  "utf8",
);
const failed = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "scripts/ghost-filmstrip-out/staged-rollout-final-after-flag-desync-fix-1784112271713/targeted-failure-detail.json",
    ),
    "utf8",
  ),
);

check(
  "OLD_PREPAINT_REMOUNT_CHATS_FAIL_RECOGNIZED",
  failed.classifications?.["shuffle->chats"] === "DESTINATION_LOADING_VISIBLE" &&
    failed.scDetail?.midTail?.exportPresent === false &&
    failed.scDetail?.midTail?.chatsHandoffSuppress === false &&
    failed.scDetail?.midTail?.mainLoadingText === true &&
    failed.scDetail?.flagEnabledFinal === true,
  { classification: failed.classifications?.["shuffle->chats"] },
);

check(
  "PREPAINT_MARKER_WRITTEN_BEFORE_SOFTNAV",
  prepaint.includes("writeChatsPrepaintHandoffMarker") &&
    nav.includes("writeChatsPrepaintHandoffMarker") &&
    shuffle.includes("writeChatsPrepaintHandoffMarker") &&
    prepaint.includes("CHATS_PREPAINT_TTL_MS") &&
    /3000/.test(prepaint),
);

check(
  "PREPAINT_SUPPRESS_INSTALLED_BEFORE_SKELETON_PAINT",
  bootstrap.includes("data-prepaint-chats-handoff-suppress") &&
    layout.includes("CHATS_PREPAINT_BOOTSTRAP_SCRIPT") &&
    layout.includes("dangerouslySetInnerHTML") &&
    prepaint.includes("installChatsPrepaintSuppressDom"),
);

check(
  "CHATS_SKELETON_HIDDEN_UNDER_PREPAINT_SUPPRESS",
  css.includes('data-prepaint-chats-handoff-suppress="1"') &&
    css.includes("[data-nav-loading-copy]") &&
    css.includes("#sayittome-main-tab-keepalive-chats"),
);

check(
  "REACT_SUPPRESS_TAKES_OVER_BEFORE_CLEAR",
  suppress.includes("handoffChatsPrepaintToReactSuppress") &&
    suppress.includes("TAB_HANDOFF_CHATS_PREPAINT_TO_REACT_SUPPRESS_HANDOFF"),
);

check(
  "DIRECT_COLD_CHATS_LOADING_ALLOWED",
  prepaint.includes('from === "/chats"') &&
    prepaint.includes("never create marker") === false
      ? prepaint.includes('if (from === "/chats") return null') &&
        nav.includes('currentPath === "/shuffle"') &&
        nav.includes('href === "/chats"')
      : prepaint.includes('if (from === "/chats") return null') &&
        nav.includes('currentPath === "/shuffle"') &&
        nav.includes('href === "/chats"'),
);

check(
  "MISSING_EXPORT_UNPROTECTED_LOADING_FAILS",
  probe.includes("TAB_HANDOFF_REMOUNT_EXPORT_PENDING_UNPROTECTED_FAIL") &&
    probe.includes("remountExportPendingUnprotected"),
);

check(
  "REMOUNT_EXPORT_PENDING_SUPPRESSED_RECOVERS",
  probe.includes("TAB_HANDOFF_REMOUNT_EXPORT_PENDING_SUPPRESSED") &&
    probe.includes("remountExportPendingSuppressed") &&
    probe.includes("prepaintChatsHandoffSuppress"),
);

check(
  "TARGETED_SHUFFLE_CHATS_CLEAN_CONTRACT_WIRED",
  inbox.includes("isChatsPrepaintHandoffActive") &&
    inbox.includes("prepaintChatsHandoffSuppress") &&
    suppress.includes("writeChatsPrepaintHandoffMarker"),
);

check(
  "SOURCE_FLAG_STILL_FALSE",
  fs
    .readFileSync(path.join(root, "src/lib/perf/instantaneityFlags.ts"), "utf8")
    .includes("MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE: false"),
);

if (live) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
      localStorage.setItem("sayittome:nav-capture", "1");
      sessionStorage.setItem("sayittome:nav-capture-session", "1");
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();

  // Marker + bootstrap before skeleton paint (hard remount).
  await page.goto(`${base}/shuffle?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(800);
  const armed = await page.evaluate(() => {
    const until = Date.now() + 3000;
    sessionStorage.setItem(
      "sayittome:chats-prepaint-handoff",
      JSON.stringify({
        destination: "/chats",
        from: "/shuffle",
        txId: "prepaint-live",
        startedAt: Date.now(),
        expiresAt: until,
      }),
    );
    sessionStorage.setItem(
      "sayittome:chats-sequence-handoff-suppress-until",
      String(until),
    );
    document.documentElement.dataset.prepaintChatsHandoffSuppress = "1";
    document.documentElement.dataset.chatsHandoffSuppress = "1";
    return {
      marker: sessionStorage.getItem("sayittome:chats-prepaint-handoff"),
      attr: document.documentElement.getAttribute("data-prepaint-chats-handoff-suppress"),
    };
  });
  await page.goto(`${base}/chats?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  // Sample ASAP (pre-effect window).
  const early = await page.evaluate(() => {
    const LOADING_RE = /Cargando\.\.\.|Loading\.\.\./i;
    const visibleLoading = [...document.querySelectorAll("[data-nav-loading-copy], [data-nav-chats-loading]")]
      .some((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          LOADING_RE.test(el.textContent || "") &&
          cs.display !== "none" &&
          cs.visibility !== "hidden" &&
          parseFloat(cs.opacity) >= 0.04 &&
          r.width > 2 &&
          r.height > 2
        );
      });
    return {
      prepaint:
        document.documentElement.getAttribute("data-prepaint-chats-handoff-suppress") ===
          "1" ||
        document.documentElement.getAttribute("data-chats-handoff-suppress") === "1",
      visibleLoading,
      pathname: location.pathname,
    };
  });
  check(
    "PREPAINT_CHATS_REMOUNT_RACE_HARNESS",
    armed.marker &&
      early.pathname === "/chats" &&
      early.prepaint === true &&
      early.visibleLoading === false,
    { armed, early },
  );

  // Direct cold: no marker → loading allowed (may or may not show; must not force hide via prepaint).
  await page.goto(`${base}/chats?navcapture=1&_cold=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  const cold = await page.evaluate(() => {
    try {
      sessionStorage.removeItem("sayittome:chats-prepaint-handoff");
      sessionStorage.removeItem("sayittome:chats-sequence-handoff-suppress-until");
    } catch {
      /* ignore */
    }
    return {
      prepaintAttr: document.documentElement.getAttribute(
        "data-prepaint-chats-handoff-suppress",
      ),
      marker: sessionStorage.getItem("sayittome:chats-prepaint-handoff"),
    };
  });
  // Reload cold without marker so bootstrap does not install.
  await page.goto(`${base}/chats?navcapture=1&_cold2=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  const cold2 = await page.evaluate(() => ({
    prepaintAttr: document.documentElement.getAttribute(
      "data-prepaint-chats-handoff-suppress",
    ),
    marker: sessionStorage.getItem("sayittome:chats-prepaint-handoff"),
    suppressUntil: sessionStorage.getItem(
      "sayittome:chats-sequence-handoff-suppress-until",
    ),
  }));
  check(
    "DIRECT_COLD_CHATS_LOADING_ALLOWED_HARNESS",
    cold2.prepaintAttr !== "1" && !cold2.marker,
    { cold, cold2 },
  );

  await browser.close();
}

const failedCount = checks.filter((c) => !c.pass).length;
const out = {
  harness: "PREPAINT_CHATS_REMOUNT_SUPPRESS",
  pass: failedCount === 0,
  failedCount,
  checks,
  live,
  base,
};
console.log(JSON.stringify(out, null, 2));
process.exit(failedCount === 0 ? 0 : 1);
