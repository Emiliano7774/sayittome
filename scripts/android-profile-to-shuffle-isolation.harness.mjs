/**
 * ANDROID_PROFILE_TO_SHUFFLE_ISOLATION_GATE
 *   node scripts/android-profile-to-shuffle-isolation.harness.mjs
 *   node scripts/android-profile-to-shuffle-isolation.harness.mjs --live --base http://127.0.0.1:3010
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const args = process.argv.slice(2);
const live = args.includes("--live");
const base = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : "http://127.0.0.1:3010";
const repeat = Math.max(
  1,
  Number(args[args.indexOf("--repeat") + 1] || (live ? 20 : 1)) || 1,
);
const profilePath = args.includes("--profile-path")
  ? args[args.indexOf("--profile-path") + 1]
  : "/u/Santi000_35";

const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const revealSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/nonMainToShuffleReveal.ts"),
  "utf8",
);
const warmSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/warmShuffleTabNavigation.ts"),
  "utf8",
);
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const routeKind = fs.readFileSync(
  path.join(root, "src/lib/navigation/routeKind.ts"),
  "utf8",
);

check(
  "NON_MAIN_TO_SHUFFLE_REVEAL_HELPER",
  revealSrc.includes("prepareShuffleRevealFromNonMainRoute") &&
    revealSrc.includes("clearProfileViewerOverlayForShuffleNav"),
);

check(
  "WARM_NAV_CALLS_NON_MAIN_REVEAL",
  warmSrc.includes("prepareShuffleRevealFromNonMainRoute"),
);

const isolationSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/nonMainRouteMainTabIsolation.ts"),
  "utf8",
);
check(
  "NON_MAIN_ISOLATION_RESPECTS_SHUFFLE_REVEAL_FROM",
  isolationSrc.includes("data-sayittome-shuffle-reveal-from") &&
    isolationSrc.includes('setAttribute("data-sayittome-route-kind", "shuffle")'),
);

check(
  "NON_MAIN_WARM_ARMS_ACTIVATE_ON_SHUFFLE",
  warmSrc.includes("activateShuffleTabSurface") &&
    warmSrc.includes("fromNonMain"),
);

check(
  "EXIT_HANDOFF_DOES_NOT_OVERRIDE_PROFILE_KIND",
  css.includes(
    'sayittome-shuffle-exit-handoff-pending:not([data-sayittome-route-kind="profile"])',
  ),
);

check(
  "OWN_PROFILE_CLASSIFIED_AS_PROFILE_ROUTE",
  routeKind.includes("isProfileRoute") &&
    routeKind.includes('path.startsWith("/u/")'),
);

if (!live) {
  const failed = checks.filter((c) => !c.pass);
  console.log(
    JSON.stringify(
      {
        gate: "ANDROID_PROFILE_TO_SHUFFLE_ISOLATION_GATE",
        pass: failed.length === 0,
        live: false,
        checks,
      },
      null,
      2,
    ),
  );
  process.exit(failed.length ? 1 : 0);
}

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";

const browser = await chromium
  .launch({ channel: "chrome", headless: true })
  .catch(() => chromium.launch({ headless: true }));

const results = [];
let overlayCount = 0;
let stickyKindCount = 0;

for (let i = 0; i < repeat; i++) {
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${base}${profilePath}?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const el = document.querySelector('[data-nav-tab="shuffle"]');
    if (!el) throw new Error("missing-shuffle");
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerType: "touch",
      }),
    );
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(2200);
  const sample = await page.evaluate(() => {
    const pathName = location.pathname;
    const kind = document.documentElement.getAttribute(
      "data-sayittome-route-kind",
    );
    const shuffle = document.getElementById("sayittome-shuffle-keepalive-host");
    const profileViewer = document.body.classList.contains(
      "sayittome-profile-viewer-open",
    );
    const shuffleVisible = !!shuffle?.classList.contains(
      "sayittome-shuffle-keepalive-visible",
    );
    const cs = shuffle ? getComputedStyle(shuffle) : null;
    return {
      path: pathName,
      kind,
      profileViewer,
      shuffleVisible,
      shuffleOpacity: cs ? Number.parseFloat(cs.opacity || "1") : 0,
      shuffleVisibility: cs?.visibility || null,
    };
  });
  const overlay =
    sample.profileViewer ||
    (sample.path === "/shuffle" &&
      sample.kind === "profile") ||
    (sample.path === "/shuffle" &&
      sample.shuffleVisibility === "hidden");
  const sticky = sample.path === "/shuffle" && sample.kind === "profile";
  if (overlay) overlayCount += 1;
  if (sticky) stickyKindCount += 1;
  results.push({ i, ...sample, overlay, sticky });
  await ctx.close();
}

await browser.close();
const pass =
  overlayCount === 0 &&
  stickyKindCount === 0 &&
  results.every((r) => r.path === "/shuffle");
check("LIVE_ANDROID_UA_PROFILE_TO_SHUFFLE_CLEAN", pass, {
  overlayCount,
  stickyKindCount,
  repeat,
});

const failed = checks.filter((c) => !c.pass);
console.log(
  JSON.stringify(
    {
      gate: "ANDROID_PROFILE_TO_SHUFFLE_ISOLATION_GATE",
      pass: failed.length === 0,
      live: true,
      provider: "PLAYWRIGHT_CHROME_ANDROID_UA_TOUCH",
      overlayCount,
      stickyKindCount,
      checks,
      results: results.slice(0, 5),
    },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);
