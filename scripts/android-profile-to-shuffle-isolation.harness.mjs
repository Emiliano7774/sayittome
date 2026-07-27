/**
 * ANDROID_PROFILE_TO_SHUFFLE_ISOLATION_GATE
 *   node scripts/android-profile-to-shuffle-isolation.harness.mjs
 *   node scripts/android-profile-to-shuffle-isolation.harness.mjs --live --base http://127.0.0.1:3010
 *
 * Fail-closed: final pathname /u/* is FAIL even when overlay=0 and sticky=0.
 * No second tap. No post-failure goto.
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
const outDir = args.includes("--out")
  ? args[args.indexOf("--out") + 1]
  : null;

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
const bottomNav = fs.readFileSync(
  path.join(root, "src/components/navigation/BottomNav.tsx"),
  "utf8",
);
const modernNav = fs.readFileSync(
  path.join(root, "src/components/navigation/ModernBottomNav.tsx"),
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
  "NON_MAIN_SYNC_ROUTE_COMMIT",
  warmSrc.includes("commitNonMainRouteToShuffleNavigation") &&
    warmSrc.includes("non-main-to-shuffle-sync") &&
    warmSrc.includes("forceSoftNavigation: true"),
);

check(
  "NON_MAIN_SHUFFLE_HREF_FALLBACK",
  bottomNav.includes('data-sayittome-nonmain-shuffle-href="1"') &&
    modernNav.includes('data-sayittome-nonmain-shuffle-href="1"') &&
    bottomNav.includes('href="/shuffle"') &&
    modernNav.includes('href="/shuffle"'),
);

check(
  "MAIN_TAB_SHUFFLE_HREF_FALLBACK",
  bottomNav.includes('data-sayittome-main-tab-shuffle-href="1"') &&
    modernNav.includes('data-sayittome-main-tab-shuffle-href="1"'),
);

check(
  "MAIN_TAB_ANDROID_FAILSAFE_COMMIT",
  warmSrc.includes("main-tab-to-shuffle-android-failsafe") &&
    warmSrc.includes("stillStuckOnOrigin"),
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
let pathStuckCount = 0;
let secondTapCount = 0;
let hrefFallbackSeen = 0;

for (let i = 0; i < repeat; i++) {
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto(`${base}${profilePath}?navcapture=1&_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });

  // /settings/edit intentionally hides bottom nav — go back to /settings first.
  if (profilePath.startsWith("/settings/edit")) {
    await page.goto(`${base}/settings?navcapture=1&_bd=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
  }

  const navReady = await page
    .waitForFunction(
      () => {
        const el = document.querySelector('[data-nav-tab="shuffle"]');
        return (
          !!el &&
          !!document.querySelector("[data-bottom-nav-implementation]")
        );
      },
      { timeout: 30_000 },
    )
    .then(() => true)
    .catch(() => false);

  if (!navReady) {
    results.push({
      i,
      path: "missing-nav",
      pathStuck: true,
      overlay: false,
      sticky: false,
      secondTap: false,
      failureClass: "MISSING_SHUFFLE_NAV",
      shuffleVisible: false,
      opacity: 0,
    });
    pathStuckCount += 1;
    await ctx.close();
    continue;
  }

  const before = await page.evaluate(() => ({
    path: location.pathname,
    kind: document.documentElement.getAttribute("data-sayittome-route-kind"),
    href: document
      .querySelector('[data-nav-tab="shuffle"]')
      ?.getAttribute("href"),
    tag: document.querySelector('[data-nav-tab="shuffle"]')?.tagName || null,
    nonmainHref: document
      .querySelector("[data-sayittome-nonmain-shuffle-href]")
      ?.getAttribute("data-sayittome-nonmain-shuffle-href"),
  }));
  if (before.nonmainHref === "1" || before.href === "/shuffle") {
    hrefFallbackSeen += 1;
  }

  // pointerdown then real element.click() — <a href> navigates even pre-hydrate;
  // synthetic MouseEvent alone does not follow href. Hard nav may destroy the
  // execution context; wait for /shuffle before sampling.
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
    el.click();
  });

  await page
    .waitForURL((url) => {
      try {
        return new URL(url).pathname === "/shuffle";
      } catch {
        return String(url).includes("/shuffle");
      }
    }, { timeout: 10_000 })
    .catch(() => null);
  await page
    .waitForLoadState("domcontentloaded", { timeout: 10_000 })
    .catch(() => null);

  async function sampleState() {
    return page.evaluate(() => {
      const host = document.getElementById("sayittome-shuffle-keepalive-host");
      const cs = host ? getComputedStyle(host) : null;
      const text = document.body?.innerText || "";
      return {
        path: location.pathname,
        kind: document.documentElement.getAttribute(
          "data-sayittome-route-kind",
        ),
        revealFrom: document.documentElement.getAttribute(
          "data-sayittome-shuffle-reveal-from",
        ),
        shuffleVisible: !!host?.classList.contains(
          "sayittome-shuffle-keepalive-visible",
        ),
        surface: !!host?.classList.contains("sayittome-shuffle-surface-active"),
        opacity: cs ? Number.parseFloat(cs.opacity || "1") : 0,
        visibility: cs?.visibility || null,
        profileViewer: document.body.classList.contains(
          "sayittome-profile-viewer-open",
        ),
        loadingStories: /Cargando historias/i.test(text),
        adminVisible: /Cerrar sesión|Copiar link|Editar perfil|Admin/i.test(
          text,
        ),
      };
    });
  }

  const timeline = [];
  const t0 = Date.now();
  for (const waitMs of [0, 120, 400, 900, 1400, 2200]) {
    const elapsed = Date.now() - t0;
    if (waitMs > elapsed) await page.waitForTimeout(waitMs - elapsed);
    let snap;
    try {
      snap = await sampleState();
    } catch {
      await page
        .waitForLoadState("domcontentloaded", { timeout: 10_000 })
        .catch(() => null);
      snap = await sampleState();
    }
    timeline.push({ waitMs, ...snap });
  }

  const sample = timeline[timeline.length - 1];
  // Any final non-/shuffle pathname is stuck (profile OR settings OR other).
  const pathStuck = sample.path !== "/shuffle";
  const overlay =
    sample.profileViewer ||
    (sample.path === "/shuffle" && sample.kind === "profile") ||
    (sample.path === "/shuffle" && sample.visibility === "hidden");
  const sticky = sample.path === "/shuffle" && sample.kind === "profile";
  if (overlay) overlayCount += 1;
  if (sticky) stickyKindCount += 1;
  if (pathStuck) pathStuckCount += 1;

  results.push({
    i,
    before,
    ...sample,
    pathStuck,
    overlay,
    sticky,
    secondTap: false,
    failureClass: pathStuck
      ? "PATH_STUCK_NONMAIN"
      : sticky
        ? "STICKY_ROUTEKIND"
        : overlay
          ? "OVERLAY_OR_HIDDEN"
          : null,
    consoleErrors: consoleErrors.slice(0, 5),
    timeline,
  });
  await ctx.close();
}

await browser.close();

const pathOk = results.every((r) => r.path === "/shuffle");
const contentOk = results.every(
  (r) => r.shuffleVisible && r.opacity > 0.2 && r.visibility !== "hidden",
);
const pass =
  overlayCount === 0 &&
  stickyKindCount === 0 &&
  pathStuckCount === 0 &&
  secondTapCount === 0 &&
  pathOk &&
  contentOk;

check("LIVE_ANDROID_UA_PROFILE_TO_SHUFFLE_CLEAN", pass, {
  overlayCount,
  stickyKindCount,
  pathStuckCount,
  secondTapCount,
  hrefFallbackSeen,
  repeat,
});

check(
  "LIVE_PATHNAME_NEVER_STUCK_ON_PROFILE",
  pathStuckCount === 0,
  { pathStuckCount },
);

const failed = checks.filter((c) => !c.pass);
const report = {
  gate: "ANDROID_PROFILE_TO_SHUFFLE_ISOLATION_GATE",
  pass: failed.length === 0,
  live: true,
  provider: "PLAYWRIGHT_CHROME_ANDROID_UA_TOUCH",
  overlayCount,
  stickyKindCount,
  pathStuckCount,
  secondTapCount,
  hrefFallbackSeen,
  checks,
  failedResults: results.filter((r) => r.path !== "/shuffle" || r.pathStuck),
  results: results.slice(0, 8),
};

if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "android-live-report.json"),
    JSON.stringify({ ...report, results }, null, 2),
  );
}

console.log(JSON.stringify(report, null, 2));
process.exit(failed.length ? 1 : 0);
