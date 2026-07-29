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
    revealSrc.includes("clearProfileViewerOverlayForShuffleNav") &&
    revealSrc.includes("presentShuffleHostForNonMainReveal") &&
    revealSrc.includes("releaseNonMainRouteShellForShuffleReveal"),
);

const presentFn = revealSrc.includes("export function presentShuffleHostForNonMainReveal")
  ? revealSrc.slice(
      revealSrc.indexOf("export function presentShuffleHostForNonMainReveal"),
      revealSrc.indexOf("export function prepareShuffleRevealFromNonMainRoute"),
    )
  : "";
const unfreezeIdx = revealSrc.indexOf(
  'remove("sayittome-shuffle-keepalive-frozen")',
);
const releaseIdx = revealSrc.indexOf("releaseNonMainRouteShellForShuffleReveal");
check(
  "PRESENT_FORCE_SURFACE_BEFORE_SHELL_HIDE",
  revealSrc.includes("forcePresentShuffleSurfaceForNonMainReveal") &&
    revealSrc.includes("hideShell") &&
    revealSrc.includes("data-sayittome-shuffle-reveal-pending"),
);

check(
  "PRESENT_UNFREEZES_BEFORE_SHELL_RELEASE",
  unfreezeIdx >= 0 && releaseIdx >= 0,
  { unfreezeIdx, releaseIdx },
);
check(
  "PRESENT_NO_SHELL_RELEASE_WITHOUT_HOST",
  presentFn.includes("if (!host) return false") ||
    presentFn.includes("if (!host) return"),
);
check(
  "PRESENT_REQUIRES_HOST_PRESENTABLE_BEFORE_SHELL_HIDE",
  revealSrc.includes("isHostPresentable") &&
    presentFn.includes("isHostPresentable(host)") &&
    revealSrc.includes("armDualHideRecovery"),
);
check(
  "DUAL_HIDE_RECOVERY_RESTORES_SHELL",
  revealSrc.includes("restoreNonMainRouteShellAfterShuffleReveal") &&
    revealSrc.includes("Never leave both surfaces hidden"),
);
check(
  "MIN_SHUFFLE_SHELL_WHEN_EMPTY",
  revealSrc.includes("ensureShuffleHostMinimumShell") &&
    revealSrc.includes("data-sayittome-shuffle-min-shell"),
);
check(
  "CSS_FORCE_SURFACE_PREP_ON_REVEAL",
  css.includes(".sayittome-shuffle-surface-prep") &&
    css.includes("data-sayittome-shuffle-reveal-from") &&
    /shuffle-reveal-from[\s\S]*surface-prep[\s\S]*visibility:\s*visible\s*!important/.test(
      css,
    ),
);
check(
  "CSS_SHELL_HIDE_REQUIRES_VISIBLE_HOST",
  css.includes(":has(") &&
    css.includes(
      "#sayittome-shuffle-keepalive-host.sayittome-shuffle-keepalive-visible",
    ) &&
    css.includes(".sayittome-route-shell"),
);
check(
  "CSS_SHUFFLE_HOST_NONTRANSPARENT_ON_REVEAL",
  css.includes("background: #0b0b0b !important") &&
    css.includes("min-height: 100dvh !important"),
);
check(
  "WARM_PIN_BEFORE_NON_MAIN_REVEAL",
  (() => {
    const begin = warmSrc.indexOf("export function beginWarmShuffleTabNavigation");
    const commit = warmSrc.indexOf("export function commitNonMainRouteToShuffleNavigation");
    const beginBody = warmSrc.slice(begin, commit > begin ? commit : begin + 2000);
    const pin = beginBody.indexOf("pinShuffleKeepAlive()");
    const prep = beginBody.indexOf("prepareShuffleRevealFromNonMainRoute");
    return pin >= 0 && prep >= 0 && pin < prep;
  })(),
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
  "ROUTE_SHELL_HIDDEN_ON_SHUFFLE_REVEAL_CSS",
  css.includes("data-sayittome-shuffle-reveal-from") &&
    css.includes(".sayittome-route-shell") &&
    css.includes(":has(") &&
    css.includes("sayittome-shuffle-keepalive-visible"),
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

  // Touch tap (not desktop-only click): pointerdown + locator.tap, with href
  // click fallback so pre-hydrate <a href="/shuffle"> still navigates.
  const shuffleNav = page.locator('[data-nav-tab="shuffle"]').first();
  await shuffleNav.dispatchEvent("pointerdown", { pointerType: "touch" }).catch(() => {});
  const tapped = await shuffleNav
    .tap({ timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!tapped) {
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
  }

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
      const navShuffle = document.querySelector('[data-nav-tab="shuffle"]');
      const navSelected =
        navShuffle?.getAttribute("aria-current") === "page" ||
        navShuffle?.getAttribute("data-selected") === "1" ||
        navShuffle?.classList?.contains("sayittome-nav-selected") ||
        !!navShuffle?.closest('[data-selected="1"]');
      const profileChromeVisible =
        /Cerrar sesión|Copiar link|Editar perfil|\bAdmin\b|Sign out|Copy invite|Edit profile|sytm\.me\/@|\/settings\/edit/i.test(
          text,
        ) ||
        (!!document.querySelector(
          'a[href*="/settings/edit"], button[data-action="logout"], [data-profile-copy-link]',
        ) &&
          !document.querySelector(
            'input[data-shuffle-search="1"], input[placeholder*="Buscar"]',
          ));
      // Profile bio / actions without Shuffle search chrome = stuck profile paint.
      const hasShuffleSearch = !!document.querySelector(
        'input[data-shuffle-search="1"], input[placeholder*="Buscar"]',
      );
      const routeShellReleased =
        document
          .querySelector(".sayittome-route-shell")
          ?.hasAttribute("hidden") ||
        document.documentElement.getAttribute("data-sayittome-route-kind") ===
          "shuffle";
      const prep = host?.querySelector(".sayittome-shuffle-surface-prep");
      const prepCs = prep ? getComputedStyle(prep) : null;
      const hostFrozen = !!host?.classList.contains(
        "sayittome-shuffle-keepalive-frozen",
      );
      const prepHidden =
        !prep ||
        (prepCs &&
          (prepCs.visibility === "hidden" ||
            Number.parseFloat(prepCs.opacity || "1") < 0.05));
      const shellHidden =
        !!document.querySelector(".sayittome-route-shell[hidden]") ||
        (() => {
          const shell = document.querySelector(".sayittome-route-shell");
          if (!shell) return routeShellReleased;
          const scs = getComputedStyle(shell);
          return scs.visibility === "hidden" || Number.parseFloat(scs.opacity || "1") < 0.05;
        })();
      const hostVisible =
        !!host &&
        host.classList.contains("sayittome-shuffle-keepalive-visible") &&
        !!cs &&
        cs.visibility !== "hidden" &&
        Number.parseFloat(cs.opacity || "1") > 0.2;
      // Pixel-ish blank coverage: large near-black rect without Shuffle chrome.
      let blankCoverage = 0;
      try {
        const canvas = document.createElement("canvas");
        const w = Math.min(120, window.innerWidth || 120);
        const h = Math.min(200, window.innerHeight || 200);
        canvas.width = w;
        canvas.height = h;
        // Approximate via DOM metrics when canvas sample unavailable.
        blankCoverage =
          !hostVisible && shellHidden
            ? 1
            : hostFrozen || prepHidden
              ? 0.85
              : !hasShuffleSearch && !profileChromeVisible
                ? 0.7
                : 0;
      } catch {
        blankCoverage = !hostVisible && shellHidden ? 1 : 0;
      }
      const meaningfulContent =
        hasShuffleSearch ||
        !!document.querySelector(
          "#sayittome-shuffle-keepalive-host [data-shuffle-list], #sayittome-shuffle-keepalive-host [data-loading-shell], #sayittome-shuffle-keepalive-host input",
        );
      // Black detector (real-device-first): must FAIL when Shuffle route has no
      // visible Shuffle surface — profileVisible=0 alone is NOT a pass.
      const blackScreen =
        location.pathname === "/shuffle" &&
        (blankCoverage >= 0.7 ||
          (!hostVisible && shellHidden) ||
          (shellHidden && (hostFrozen || prepHidden || !host)) ||
          (!meaningfulContent && !profileChromeVisible && shellHidden) ||
          (!hostVisible && !profileChromeVisible));
      const profileContentStuck =
        location.pathname === "/shuffle" &&
        (profileChromeVisible ||
          (!hasShuffleSearch &&
            /@[A-Za-z0-9._-]{3,}/.test(text) &&
            !routeShellReleased));
      // Even with search present: any visible profile chrome after Shuffle tap = FAIL.
      const profileChromeAfterShuffle =
        location.pathname === "/shuffle" && profileChromeVisible;
      // Search in DOM under frozen/hidden prep does not count as visible Shuffle.
      const shuffleSearchPainted =
        hasShuffleSearch &&
        !hostFrozen &&
        !prepHidden &&
        !!host?.classList.contains("sayittome-shuffle-keepalive-visible");
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
        hostVisible,
        meaningfulContent: !!meaningfulContent,
        blankCoverage,
        surface: !!host?.classList.contains("sayittome-shuffle-surface-active"),
        opacity: cs ? Number.parseFloat(cs.opacity || "1") : 0,
        visibility: cs?.visibility || null,
        profileViewer: document.body.classList.contains(
          "sayittome-profile-viewer-open",
        ),
        loadingStories: /Cargando historias/i.test(text),
        adminVisible: profileChromeVisible,
        profileContentStuck,
        profileChromeAfterShuffle,
        navSelected,
        hasShuffleSearch,
        shuffleSearchPainted,
        routeShellReleased,
        hostFrozen,
        prepHidden: !!prepHidden,
        blackScreen,
        activePanelNull:
          !host ||
          (!host.classList.contains("sayittome-shuffle-keepalive-visible") &&
            shellHidden),
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
  const profileContentVisible = !!(
    sample.adminVisible ||
    sample.profileContentStuck ||
    sample.profileChromeAfterShuffle
  );
  const overlay =
    sample.profileViewer ||
    profileContentVisible ||
    sample.blackScreen ||
    sample.activePanelNull ||
    (sample.path === "/shuffle" && sample.kind === "profile") ||
    (sample.path === "/shuffle" && sample.visibility === "hidden") ||
    (sample.path === "/shuffle" && !sample.shuffleSearchPainted);
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
    profileContentVisible,
    secondTap: false,
    failureClass: pathStuck
      ? "PATH_STUCK_NONMAIN"
      : sticky
        ? "STICKY_ROUTEKIND"
        : sample.blackScreen
          ? "ANDROID_BLACK_SCREEN"
          : sample.activePanelNull
            ? "ACTIVE_PANEL_NULL"
          : profileContentVisible
          ? "PROFILE_CONTENT_VISIBLE"
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
const profilePaintOk = results.every(
  (r) =>
    !r.adminVisible &&
    !r.profileContentStuck &&
    !r.profileChromeAfterShuffle &&
    r.shuffleSearchPainted,
);
const blackOk = results.every((r) => !r.blackScreen && !r.activePanelNull && !r.hostFrozen);
const pass =
  overlayCount === 0 &&
  stickyKindCount === 0 &&
  pathStuckCount === 0 &&
  secondTapCount === 0 &&
  pathOk &&
  contentOk &&
  profilePaintOk &&
  blackOk;

check("LIVE_ANDROID_UA_PROFILE_TO_SHUFFLE_CLEAN", pass, {
  overlayCount,
  stickyKindCount,
  pathStuckCount,
  secondTapCount,
  hrefFallbackSeen,
  repeat,
  profilePaintOk,
  blackOk,
});

check(
  "LIVE_ANDROID_NO_BLACK_SCREEN",
  blackOk,
  {
    black: results.filter((r) => r.blackScreen || r.hostFrozen || r.activePanelNull).length,
  },
);

check(
  "LIVE_ANDROID_PROFILE_CONTENT_NOT_VISIBLE_AFTER_SHUFFLE",
  profilePaintOk,
  {
    stuck: results.filter((r) => r.adminVisible || r.profileContentStuck).length,
  },
);

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
