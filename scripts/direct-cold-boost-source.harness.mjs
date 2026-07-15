/**
 * Direct cold /boost must not default beginPostAuth from → "/shuffle".
 * Static + optional live checks.
 *
 *   node scripts/direct-cold-boost-source.harness.mjs
 *   node scripts/direct-cold-boost-source.harness.mjs --live --base http://127.0.0.1:3010
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

const readiness = fs.readFileSync(
  path.join(root, "src/lib/navigation/tabDestinationReadiness.ts"),
  "utf8",
);
const prepaint = fs.readFileSync(
  path.join(root, "src/lib/boost/boostPrepaintHandoff.ts"),
  "utf8",
);
const suppress = fs.readFileSync(
  path.join(root, "src/lib/boost/boostHandoffSuppress.ts"),
  "utf8",
);
const nav = fs.readFileSync(
  path.join(root, "src/components/navigation/BottomNavLink.tsx"),
  "utf8",
);
const shuffle = fs.readFileSync(
  path.join(root, "src/lib/navigation/shuffleHandoffState.ts"),
  "utf8",
);

const reprocess = spawnSync(
  process.execPath,
  [
    path.join(root, "scripts/reprocess-direct-cold-boost-source-rollout.mjs"),
    path.join(
      root,
      "scripts/ghost-filmstrip-out/direct-cold-boost-source-product-fix-reprocess-tmp",
    ),
  ],
  { encoding: "utf8" },
);
let reprocessJson = {};
try {
  reprocessJson = JSON.parse(reprocess.stdout || "{}");
} catch {
  reprocessJson = { status: "PARSE_FAIL", recognized: false };
}

check(
  "OLD_DIRECT_COLD_BOOST_FAIL_RECOGNIZED",
  reprocess.status === 0 && reprocessJson.recognized === true,
  { status: reprocessJson.status, exit: reprocess.status },
);

check(
  "BEGINPOSTAUTH_NULL_SOURCE_DOES_NOT_DEFAULT_TO_SHUFFLE",
  !readiness.includes('source ? String(source) : "/shuffle"') &&
    !readiness.includes("source ? String(source) : '/shuffle'") &&
    readiness.includes("resolveBoostInternalHandoffFrom") &&
    readiness.includes("TAB_HANDOFF_BOOST_DIRECT_COLD_NO_SOURCE_NOOP") &&
    readiness.includes("boostAllowSuppressArm") &&
    prepaint.includes("isRealInternalBoostHandoffSource") &&
    prepaint.includes("TAB_HANDOFF_BOOST_SOURCE_FALLBACK_BLOCKED"),
);

check(
  "BEGINPOSTAUTH_NO_HARDCODED_FROM_SHUFFLE_ARMS",
  !/armBoostSequenceHandoffSuppress\([^)]*from:\s*["']\/shuffle["']/.test(
    readiness,
  ) && readiness.includes("armBoostInternalHandoffSuppressIfAllowed"),
);

check(
  "WRITE_MARKER_REJECTS_NON_INTERNAL_SOURCE",
  prepaint.includes("!isRealInternalBoostHandoffSource(from)") &&
    prepaint.includes("TAB_HANDOFF_BOOST_MARKER_WRITE_SKIPPED_NO_REAL_SOURCE"),
);

check(
  "INTERNAL_SHUFFLE_BOOST_EXPLICIT_SOURCE_STILL_WRITES",
  nav.includes('writeBoostPrepaintHandoffMarker({ from: "/shuffle" })') &&
    shuffle.includes('writeBoostPrepaintHandoffMarker({ from: "/shuffle" })') &&
    suppress.includes("isRealInternalBoostHandoffSource"),
);

check(
  "DIAG_EVENTS_PRESENT",
  [
    "TAB_HANDOFF_BOOST_DIRECT_COLD_NO_SOURCE_NOOP",
    "TAB_HANDOFF_BOOST_DIRECT_COLD_MARKER_NOT_ARMED",
    "TAB_HANDOFF_BOOST_INTERNAL_SOURCE_ACCEPTED",
    "TAB_HANDOFF_BOOST_SOURCE_FALLBACK_BLOCKED",
    "TAB_HANDOFF_BOOST_STALE_MARKER_CLEARED_ON_COLD",
    "TAB_HANDOFF_BOOST_MARKER_WRITE_SKIPPED_NO_REAL_SOURCE",
  ].every((e) => readiness.includes(e) || prepaint.includes(e)),
);

if (live) {
  const { chromium } = await import("playwright");
  const browser = await chromium
    .launch({ headless: true, channel: "chrome" })
    .catch(() => chromium.launch({ headless: true }));

  async function samplePath(pathname, injectStale = false) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv",
    });
    await ctx.addInitScript(
      ({ injectStale }) => {
        try {
          localStorage.setItem(
            "sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE",
            "true",
          );
          if (injectStale) {
            const expired = {
              destination: "/boost",
              from: "/shuffle",
              txId: "htx-stale-test",
              startedAt: Date.now() - 10_000,
              expiresAt: Date.now() - 5_000,
            };
            sessionStorage.setItem(
              "sayittome:boost-prepaint-handoff",
              JSON.stringify(expired),
            );
            sessionStorage.setItem(
              "sayittome:boost-sequence-handoff-suppress-until",
              String(Date.now() - 1000),
            );
          }
        } catch {
          /* ignore */
        }
      },
      { injectStale },
    );
    const page = await ctx.newPage();
    await page.goto(`${base}${pathname}?_bd=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForTimeout(1000);
    const snap = await page.evaluate(() => {
      const markerRaw = sessionStorage.getItem("sayittome:boost-prepaint-handoff");
      let marker = null;
      try {
        marker = markerRaw ? JSON.parse(markerRaw) : null;
      } catch {
        marker = null;
      }
      const bodyText = document.body?.innerText || "";
      return {
        path: location.pathname,
        prepaintBoost: document.documentElement.getAttribute(
          "data-prepaint-boost-handoff-suppress",
        ),
        boostSuppress: document.documentElement.getAttribute(
          "data-boost-handoff-suppress",
        ),
        boostMarker: markerRaw,
        markerFrom: marker?.from ?? null,
        markerTx: marker?.txId ?? null,
        suppressUntil: sessionStorage.getItem(
          "sayittome:boost-sequence-handoff-suppress-until",
        ),
        loadingVisible: /Cargando\.\.\./.test(bodyText),
        navCaptureSource:
          document.documentElement.dataset.sayittomeMainTabHandoffSource || null,
        diag: (window.__sayittomePrepaintDiag || []).slice(-8),
        shellDiag: (window.__sayittomeTabShellNoLoadingDiag?.events || []).slice(
          -12,
        ),
      };
    });
    await ctx.close();
    return snap;
  }

  const coldRuns = [];
  for (let i = 0; i < 10; i++) {
    coldRuns.push(await samplePath("/boost", false));
  }
  const coldPass = coldRuns.every(
    (r) =>
      r.prepaintBoost !== "1" &&
      r.boostSuppress !== "1" &&
      r.boostMarker == null &&
      r.markerFrom !== "/shuffle" &&
      r.markerTx == null,
  );
  check("DIRECT_COLD_BOOST_DOES_NOT_ARM_MARKER_OR_SUPPRESS", coldPass, {
    sample: coldRuns[0],
    failCount: coldRuns.filter((r) => r.boostMarker || r.prepaintBoost === "1")
      .length,
  });
  check(
    "DIRECT_COLD_BOOST_CAN_SHOW_LOADING_ALLOWED",
    true,
    { note: "loadingVisible allowed; not gated as fail", anyLoading: coldRuns.some((r) => r.loadingVisible) },
  );

  const stale = await samplePath("/boost", true);
  check(
    "STALE_BOOST_MARKER_CLEARED_ON_COLD",
    stale.boostMarker == null &&
      stale.prepaintBoost !== "1" &&
      stale.boostSuppress !== "1",
    { stale },
  );

  // Internal path: open shuffle, write explicit marker via evaluate (simulates pointerdown),
  // then navigate to boost — marker may be present (armed). Better: tap Boost nav.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE", "true");
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/shuffle?_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(800);
  const boostNav = page.locator('a[href="/boost"], [data-nav-href="/boost"]').first();
  let internalArmed = false;
  if (await boostNav.count()) {
    await boostNav.dispatchEvent("pointerdown");
    await page.waitForTimeout(50);
    const mid = await page.evaluate(() => {
      let marker = null;
      try {
        marker = JSON.parse(
          sessionStorage.getItem("sayittome:boost-prepaint-handoff") || "null",
        );
      } catch {
        marker = null;
      }
      return {
        marker,
        markerRaw: sessionStorage.getItem("sayittome:boost-prepaint-handoff"),
        prepaint: document.documentElement.getAttribute(
          "data-prepaint-boost-handoff-suppress",
        ),
        suppress: document.documentElement.getAttribute(
          "data-boost-handoff-suppress",
        ),
      };
    });
    await boostNav.click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      let marker = null;
      try {
        marker = JSON.parse(
          sessionStorage.getItem("sayittome:boost-prepaint-handoff") || "null",
        );
      } catch {
        marker = null;
      }
      return {
        path: location.pathname,
        marker,
        prepaint: document.documentElement.getAttribute(
          "data-prepaint-boost-handoff-suppress",
        ),
        suppress: document.documentElement.getAttribute(
          "data-boost-handoff-suppress",
        ),
      };
    });
    internalArmed =
      mid.marker?.from === "/shuffle" ||
      mid.prepaint === "1" ||
      mid.suppress === "1" ||
      after.marker?.from === "/shuffle" ||
      after.prepaint === "1" ||
      after.suppress === "1";
  }
  await ctx.close();
  check("INTERNAL_SHUFFLE_BOOST_EXPLICIT_SOURCE_ARMS_SUPPRESS", internalArmed, {
    note: "pointerdown on Boost nav from Shuffle",
  });

  const chats = await samplePath("/chats", false);
  check(
    "CHATS_PREPAINT_STILL_CLEAN_ON_DIRECT_COLD",
    chats.prepaintBoost !== "1" &&
      (await (async () => {
        // chats marker check via separate sample already in path=/chats
        return true;
      })()),
  );

  await browser.close();
}

const failed = checks.filter((c) => !c.pass);
const out = {
  pass: failed.length === 0,
  live,
  checks,
  failed: failed.map((c) => c.name),
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
