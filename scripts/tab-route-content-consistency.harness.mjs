/**
 * TAB_ROUTE_CONTENT_CONSISTENCY_GATE — static + optional local live probe.
 *   node scripts/tab-route-content-consistency.harness.mjs
 *   node scripts/tab-route-content-consistency.harness.mjs --live --base http://127.0.0.1:3010
 */
import fs from "node:fs";
import path from "node:path";

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
const fromTab = (args.includes("--from")
  ? args[args.indexOf("--from") + 1]
  : "chats") || "chats";
const mode = args.includes("--mode")
  ? args[args.indexOf("--mode") + 1]
  : "shuffle-to-stories";
const waitMs = Math.max(
  1000,
  Number(args[args.indexOf("--wait-ms") + 1] || "5200") || 5200,
);
/**
 * Prod-like cold Stories (default ON for --live so local FLR cannot false-PASS
 * like 29e898d). Opt out with --no-cold-stories.
 */
const coldStories =
  args.includes("--cold-stories") ||
  (live && !args.includes("--no-cold-stories"));
const coldStoriesDelayMs = Math.max(
  0,
  Number(
    args[args.indexOf("--cold-delay-ms") + 1] || (coldStories ? "6500" : "0"),
  ) || 0,
);

const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const keepAlive = fs.readFileSync(
  path.join(root, "src/lib/navigation/mainTabKeepAlive.ts"),
  "utf8",
);
const host = fs.readFileSync(
  path.join(root, "src/components/navigation/MainTabKeepAliveHost.tsx"),
  "utf8",
);
const handoff = fs.readFileSync(
  path.join(root, "src/lib/navigation/shuffleHandoffState.ts"),
  "utf8",
);
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

check(
  "OLD_STORIES_SELECTED_CHATS_VISIBLE_REPRODUCES",
  // Old hardcoded CSS force-chats under handoff-pending is gone.
  !css.includes(
    "html.sayittome-shuffle-handoff-pending #sayittome-main-tab-keepalive-chats {",
  ) &&
    css.includes('data-shuffle-defer-source="chats"') &&
    keepAlive.includes("onConcreteMainTab"),
);

check(
  "DESTINATION_PATH_WINS_OVER_STALE_DEFER",
  host.includes("Once the router is on a concrete main tab") &&
    keepAlive.includes("onConcreteMainTab"),
);

check(
  "EXIT_CLEARS_ENTRY_DEFER_AND_HANDOFF_PENDING",
  handoff.includes("shuffleRevealDeferred = false") &&
    handoff.includes('classList.remove("sayittome-shuffle-handoff-pending")') &&
    handoff.includes("beginShuffleExitToMainTab"),
);

check(
  "CSS_DEFER_SOURCE_SCOPED_NOT_HARDCODED_CHATS",
  css.includes('data-shuffle-defer-source="stories"') &&
    css.includes('data-shuffle-defer-source="chats"') &&
    css.includes('data-shuffle-defer-source="boost"') &&
    css.includes('data-shuffle-defer-source="settings"'),
);

check(
  "STALE_OWNERSHIP_IGNORED_ON_CONCRETE_MAIN_TAB",
  keepAlive.includes("!onConcreteMainTab && isMainTabToShufflePresentationOwned"),
);

const bottomNavLink = fs.readFileSync(
  path.join(root, "src/components/navigation/BottomNavLink.tsx"),
  "utf8",
);
check(
  "NATIVE_SOFT_CLICK_ABORTS_SLIDE_BEFORE_STORIES_PUSH",
  bottomNavLink.includes("concreteMainTabDestination") &&
    bottomNavLink.includes('abortMainTabToShuffleTransition("navigation-replaced")') &&
    bottomNavLink.includes("router.push(href)") &&
    // Must not swallow preventDefault'd native soft clicks while sliding.
    bottomNavLink.includes(
      "!concreteMainTabDestination && blockMainTabNavigationDuringSlide()",
    ) &&
    // Mid-slide: commit on pointerdown so a lost click cannot leave /shuffle.
    bottomNavLink.includes("mustCommitDuringHandoff") &&
    bottomNavLink.includes("commitConcreteMainTabSoft") &&
    bottomNavLink.includes("noteConcreteMainTabSupersede") &&
    bottomNavLink.includes("cancelPendingShuffleRouteCommits"),
);

const transitionSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/mainTabToShuffleTransition.ts"),
  "utf8",
);
const warmShuffleSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/warmShuffleTabNavigation.ts"),
  "utf8",
);
check(
  "DEFERRED_SHUFFLE_COMMIT_RESPECTS_SUPERSEDE_EPOCH",
  transitionSrc.includes("noteConcreteMainTabSupersede") &&
    transitionSrc.includes("epochAtRegister") &&
    transitionSrc.includes("supersedeAtRegister") &&
    warmShuffleSrc.includes("getConcreteMainTabSupersedeEpoch") &&
    warmShuffleSrc.includes("supersedeEpoch !== getConcreteMainTabSupersedeEpoch()"),
);

const harnessSelf = fs.readFileSync(
  path.join(root, "scripts/tab-route-content-consistency.harness.mjs"),
  "utf8",
);
check(
  "LOADING_CLASSIFIES_VISIBLE_VS_HIDDEN",
  harnessSelf.includes("visibleLoadingTextCount") &&
    harnessSelf.includes("hiddenLoadingTextCount") &&
    harnessSelf.includes("inactivePanelLoadingTextCount") &&
    harnessSelf.includes("residualDomLoadingTextCount") &&
    harnessSelf.includes("activePanelLoadingTextCount") &&
    harnessSelf.includes("pixelVisible"),
);
check(
  "CONTRACT_FAILS_ON_VISIBLE_LOADING",
  harnessSelf.includes("metrics.visibleLoadingTextCount > 0") &&
    harnessSelf.includes("metrics.activePanelLoadingTextCount > 0") &&
    harnessSelf.includes("metrics.staleLocatorUnresolvedCount > 0") &&
    harnessSelf.includes("contractPass"),
);
check(
  "COLD_STORIES_GATE_HARDENS_LOCAL_FLR",
  harnessSelf.includes("sayittome:stories:hydrated:v1") &&
    harnessSelf.includes("__SAYITTOME_TEST_STORIES_INDEX_DELAY_MS") &&
    harnessSelf.includes("--cold-stories"),
);
const storiesReadySrc = fs.readFileSync(
  path.join(root, "src/hooks/useStoriesReady.ts"),
  "utf8",
);
check(
  "STORIES_LOADING_COPY_DISABLED_UNDER_NO_LOADING_FLAG",
  storiesReadySrc.includes("isMainTabToShuffleMicroSlideEnabled") &&
    storiesReadySrc.includes("shouldShowStoriesLoading") &&
    storiesReadySrc.includes("return false"),
);
check(
  "STALE_LOCATOR_RECOVER_OR_UNRESOLVED",
  harnessSelf.includes("staleLocatorRecoveredCount") &&
    harnessSelf.includes("staleLocatorUnresolvedCount") &&
    harnessSelf.includes("locatorClickFallbackCount"),
);
check(
  "NAV_TAP_CLASSIFIES_TIMEOUT_AND_PRECONDITIONS",
  harnessSelf.includes("NAV_ABSENT_PRODUCT_BUG") &&
    harnessSelf.includes("NAV_ABSENT_NON_MAIN_EXPECTED") &&
    harnessSelf.includes("NAV_SHELL_NOT_READY") &&
    harnessSelf.includes("NAV_HIDDEN_OR_INERT") &&
    harnessSelf.includes("NAV_LOCATOR_STALE") &&
    harnessSelf.includes("NAV_SELECTOR_CHANGED") &&
    harnessSelf.includes("NAV_FRAME_CONTEXT_SWAP") &&
    harnessSelf.includes("NAV_UNKNOWN") &&
    harnessSelf.includes("navLocatorTimeoutUnclassifiedCount") &&
    harnessSelf.includes("navMainRouteAbsentCount"),
);
check(
  "NAV_SHELL_READY_FAIL_CLOSED_WITH_SEED_REENTEER",
  harnessSelf.includes("ensureMainShellReady") &&
    harnessSelf.includes("navShellReadyRecoveredCount") &&
    harnessSelf.includes("shellReadyMs") &&
    harnessSelf.includes("NAV_SHELL_NOT_READY") &&
    // One seed re-enter is setup recovery, not a second Shuffle tap.
    harnessSelf.includes("shell-not-ready-seed-reenter"),
);
check(
  "CONTRACT_FAILS_ON_NAV_MAIN_ABSENT_OR_UNCLASSIFIED_TIMEOUT",
  harnessSelf.includes("metrics.navMainRouteAbsentCount > 0") &&
    harnessSelf.includes("metrics.navLocatorTimeoutUnclassifiedCount > 0") &&
    harnessSelf.includes("metrics.navSelectorChangedCount > 0"),
);

function isContextDestroyedError(err) {
  const msg = String(err?.message || err || "");
  return /Execution context was destroyed|Target closed|Frame was detached|most likely because of a navigation/i.test(
    msg,
  );
}

async function readTabConsistencySample(page) {
  return page.evaluate(() => {
    const path = location.pathname;
    const stories = document.getElementById(
      "sayittome-main-tab-keepalive-stories",
    );
    const chats = document.getElementById(
      "sayittome-main-tab-keepalive-chats",
    );
    const panelVisible = (el) => {
      if (!el) return false;
      if (!el.classList.contains("sayittome-main-tab-keepalive-visible")) {
        return false;
      }
      const cs = getComputedStyle(el);
      const opacity = Number.parseFloat(cs.opacity || "1");
      return (
        cs.visibility !== "hidden" &&
        cs.display !== "none" &&
        (Number.isFinite(opacity) ? opacity > 0.05 : true)
      );
    };
    const isKeepAliveHost = (el) =>
      !!el?.id?.startsWith?.("sayittome-main-tab-keepalive-") ||
      el?.id === "sayittome-shuffle-keepalive-host";
    const nearestKeepAlive = (el) => {
      let cur = el;
      while (cur && cur !== document.documentElement) {
        if (isKeepAliveHost(cur)) return cur;
        cur = cur.parentElement;
      }
      return null;
    };
    const classifyLoadingMatches = () => {
      const re = /cargando/i;
      const matches = [];
      const walker = document.createTreeWalker(
        document.body || document.documentElement,
        NodeFilter.SHOW_TEXT,
      );
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = String(node.textContent || "").trim();
        if (!text || !re.test(text)) continue;
        const el = node.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const opacity = Number.parseFloat(cs.opacity || "1");
        const host = nearestKeepAlive(el);
        const hostVisible = host
          ? host.classList.contains("sayittome-main-tab-keepalive-visible") ||
            host.classList.contains("sayittome-shuffle-keepalive-visible")
          : true;
        const ariaHidden =
          el.closest("[aria-hidden='true']") != null ||
          el.getAttribute("aria-hidden") === "true";
        const inert =
          el.closest("[inert]") != null || el.hasAttribute("inert");
        const hiddenAttr = el.closest("[hidden]") != null || el.hasAttribute("hidden");
        const zeroRect =
          rect.width < 1 ||
          rect.height < 1 ||
          rect.bottom <= 0 ||
          rect.right <= 0 ||
          rect.top >= (window.innerHeight || 0) ||
          rect.left >= (window.innerWidth || 0);
        const styleHidden =
          cs.display === "none" ||
          cs.visibility === "hidden" ||
          (Number.isFinite(opacity) && opacity <= 0.05) ||
          cs.contentVisibility === "hidden";
        const pixelVisible =
          !styleHidden &&
          !ariaHidden &&
          !inert &&
          !hiddenAttr &&
          !zeroRect &&
          hostVisible;
        const inActivePanel =
          hostVisible &&
          (host?.classList.contains("sayittome-main-tab-keepalive-visible") ||
            host?.classList.contains("sayittome-shuffle-keepalive-visible") ||
            !host);
        let bucket = "residualDom";
        if (pixelVisible && inActivePanel) bucket = "visibleActive";
        else if (pixelVisible && !inActivePanel) bucket = "visibleInactive";
        else if (!hostVisible || (host && !hostVisible)) bucket = "inactivePanel";
        else if (styleHidden || ariaHidden || inert || hiddenAttr || zeroRect)
          bucket = "hidden";
        matches.push({
          text: text.slice(0, 80),
          bucket,
          pixelVisible,
          inActivePanel,
          hostId: host?.id || null,
          hostVisible,
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          pointerEvents: cs.pointerEvents,
          ariaHidden,
          inert,
          hiddenAttr,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
          ancestry: (() => {
            const parts = [];
            let cur = el;
            for (let i = 0; i < 6 && cur; i++) {
              parts.push(
                `${cur.tagName.toLowerCase()}${cur.id ? `#${cur.id}` : ""}${
                  cur.className && typeof cur.className === "string"
                    ? "." + cur.className.trim().split(/\s+/).slice(0, 2).join(".")
                    : ""
                }`,
              );
              cur = cur.parentElement;
            }
            return parts;
          })(),
        });
      }
      const visibleActive = matches.filter((m) => m.bucket === "visibleActive");
      const visibleInactive = matches.filter(
        (m) => m.bucket === "visibleInactive",
      );
      const hidden = matches.filter((m) => m.bucket === "hidden");
      const inactivePanel = matches.filter((m) => m.bucket === "inactivePanel");
      const residual = matches.filter((m) => m.bucket === "residualDom");
      return {
        loadingTextAnywhereRaw: matches.length > 0,
        loadingTextAnywhereCountRaw: matches.length,
        visibleLoadingTextCount: visibleActive.length + visibleInactive.length,
        activePanelLoadingTextCount: visibleActive.length,
        hiddenLoadingTextCount: hidden.length,
        inactivePanelLoadingTextCount: inactivePanel.length,
        residualDomLoadingTextCount: residual.length,
        // Legacy boolean: body.innerText (can include non-painted keep-alive text).
        loadingTextAnywhereLegacyInnerText: /cargando/i.test(
          document.body?.innerText || "",
        ),
        loadingMatches: matches.slice(0, 12),
      };
    };
    const navEntries = performance.getEntriesByType?.("navigation") || [];
    const nav0 = navEntries[0];
    const loading = classifyLoadingMatches();
    return {
      t: Date.now(),
      path,
      storiesVisible: panelVisible(stories),
      chatsVisible: panelVisible(chats),
      navStories: path === "/stories",
      routeKind: document.documentElement.getAttribute(
        "data-sayittome-route-kind",
      ),
      storiesClass: stories?.className || null,
      chatsClass: chats?.className || null,
      deferSource: document.documentElement.getAttribute(
        "data-shuffle-defer-source",
      ),
      handoffPending: document.documentElement.classList.contains(
        "sayittome-shuffle-handoff-pending",
      ),
      exitPending: document.documentElement.classList.contains(
        "sayittome-shuffle-exit-handoff-pending",
      ),
      htmlClass: document.documentElement.className,
      navPerfType: nav0?.type || null,
      navLegacyType: performance.navigation?.type ?? null,
      selectedNav:
        document
          .querySelector('[data-nav-tab][aria-current="page"], [data-nav-tab].active, [data-nav-tab][data-selected="true"]')
          ?.getAttribute("data-nav-tab") || null,
      ...loading,
      // Contract alias: only pixel-visible loading fails the gate.
      loadingTextAnywhere: loading.visibleLoadingTextCount > 0,
    };
  });
}

async function liveProbe() {
  const { chromium } = await import("playwright");
  const browser = await chromium
    .launch({ headless: true, channel: "chrome" })
    .catch(() => chromium.launch({ headless: true }));
  const UA =
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";

  const metrics = {
    contextDestroyedCount: 0,
    contextDestroyedClassified: {
      SPA_NAV_CONTEXT_SWAP: 0,
      HARD_RELOAD: 0,
      PROBE_STALE_CONTEXT: 0,
      UNEXPECTED_NAV: 0,
      UNKNOWN: 0,
    },
    expectedSpaNavContextSwapCount: 0,
    unexpectedHardReloadCount: 0,
    // Legacy alias: locator click fallbacks (not unresolved product state).
    staleLocatorCount: 0,
    staleLocatorRecoveredCount: 0,
    staleLocatorUnresolvedCount: 0,
    locatorClickFallbackCount: 0,
    routeMismatchCount: 0,
    contentMismatchCount: 0,
    navMismatchCount: 0,
    selectedMismatchCount: 0,
    staleTxActivationCount: 0,
    recoveryRedirectCount: 0,
    // Legacy raw: samples where any DOM "Cargando" text node existed.
    loadingTextAnywhereCountRaw: 0,
    // Legacy alias kept for rollout parsers; now tracks VISIBLE loading only.
    loadingTextAnywhereCount: 0,
    visibleLoadingTextCount: 0,
    hiddenLoadingTextCount: 0,
    inactivePanelLoadingTextCount: 0,
    residualDomLoadingTextCount: 0,
    activePanelLoadingTextCount: 0,
    loadingMatchSamples: [],
    // Bottom-nav locator contract (tapNav).
    navTabLookupCount: 0,
    navTabFoundCount: 0,
    navTabMissingCount: 0,
    navTabVisibleCount: 0,
    navTabHiddenCount: 0,
    navTabInertCount: 0,
    navTabDisabledCount: 0,
    navTabCoveredCount: 0,
    navTabActionableCount: 0,
    navLocatorTimeoutCount: 0,
    navLocatorTimeoutClassifiedCount: 0,
    navLocatorTimeoutUnclassifiedCount: 0,
    navSelectorChangedCount: 0,
    navShellNotReadyCount: 0,
    navShellReadyRecoveredCount: 0,
    navShellReadyWaitMsTotal: 0,
    navNonMainPreconditionCount: 0,
    navMainRouteAbsentCount: 0,
    navTimeoutClassified: {
      NAV_ABSENT_PRODUCT_BUG: 0,
      NAV_ABSENT_NON_MAIN_EXPECTED: 0,
      NAV_SELECTOR_CHANGED: 0,
      NAV_SHELL_NOT_READY: 0,
      NAV_LOCATOR_STALE: 0,
      NAV_HIDDEN_OR_INERT: 0,
      NAV_FRAME_CONTEXT_SWAP: 0,
      NAV_UNKNOWN: 0,
    },
    navTimeoutSamples: [],
  };

  const results = [];
  for (let i = 0; i < repeat; i++) {
    const ctx = await browser.newContext({
      userAgent: UA,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addInitScript(
      ({ delayMs }) => {
        try {
          localStorage.setItem(
            "sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE",
            "true",
          );
          // Classic shell keeps bottom nav on /shuffle (modern hides it).
          localStorage.setItem("sayittome_ux_mode", "classic");
          // Prevent false-warm from prior Stories hydration in the same context.
          sessionStorage.removeItem("sayittome:stories:hydrated:v1");
          if (delayMs > 0) {
            window.__SAYITTOME_TEST_STORIES_INDEX_DELAY_MS = delayMs;
          }
        } catch {
          /* ignore */
        }
      },
      { delayMs: coldStoriesDelayMs },
    );
    const page = await ctx.newPage();
    // Bypass SW/cache so local stays production-like for Stories cold mounts.
    await page.route("**/sw.js", (route) => route.abort()).catch(() => {});
    await ctx.addInitScript(() => {
      try {
        if (navigator.serviceWorker?.getRegistrations) {
          void navigator.serviceWorker
            .getRegistrations()
            .then((regs) => regs.forEach((r) => r.unregister()));
        }
      } catch {
        /* ignore */
      }
    });
    const lifecycle = [];
    const noteLife = (type, extra = {}) => {
      lifecycle.push({ t: Date.now(), type, url: page.url(), ...extra });
    };
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        noteLife("framenavigated", { frameUrl: frame.url() });
      }
    });
    page.on("crash", () => noteLife("crash"));
    page.on("pageerror", (err) =>
      noteLife("pageerror", { text: String(err).slice(0, 300) }),
    );

    const seed = ["chats", "boost", "settings", "stories", "shuffle"].includes(
      fromTab,
    )
      ? fromTab
      : "chats";
    await page.goto(`${base}/${seed}?navcapture=1&_bd=${Date.now()}`, {
      // load > domcontentloaded: cold/prod SSR needs JS before AppNavigation mounts
      waitUntil: coldStories ? "load" : "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForTimeout(coldStories ? 1200 : 900);
    for (let d = 0; d < 3; d++) {
      try {
        const dismiss = page
          .getByRole("button", { name: /Ahora no|Not now/i })
          .first();
        if (await dismiss.isVisible({ timeout: 400 }).catch(() => false)) {
          await dismiss.click({ force: true }).catch(() => {});
        } else break;
      } catch {
        break;
      }
    }

    const MAIN_TAB_PATHS = new Set([
      "/chats",
      "/shuffle",
      "/boost",
      "/settings",
      "/stories",
    ]);

    async function readNavSnapshot(tab) {
      return page.evaluate((want) => {
        const pathName = location.pathname;
        const routeKind = document.documentElement.getAttribute(
          "data-sayittome-route-kind",
        );
        const ux = document.documentElement.getAttribute("data-ux");
        const all = [...document.querySelectorAll("[data-nav-tab]")].map(
          (el) => el.getAttribute("data-nav-tab"),
        );
        const el = document.querySelector(`[data-nav-tab="${want}"]`);
        const navHost = document.querySelector(
          "[data-bottom-nav-implementation]",
        );
        const bodyHasNav = document.body.classList.contains(
          "sayittome-has-bottom-nav",
        );
        if (!el) {
          return {
            path: pathName,
            routeKind,
            ux,
            allTabs: all,
            present: false,
            visible: false,
            inert: false,
            disabled: false,
            covered: false,
            actionable: false,
            navImpl: navHost?.getAttribute("data-bottom-nav-implementation"),
            bodyHasNav,
            ready: Boolean(navHost) || bodyHasNav || all.length > 0,
          };
        }
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const visible =
          cs.visibility !== "hidden" &&
          cs.display !== "none" &&
          Number.parseFloat(cs.opacity || "1") > 0.05 &&
          r.width > 0 &&
          r.height > 0;
        const inert =
          el.hasAttribute("inert") || el.closest("[inert]") != null;
        const disabled =
          el.hasAttribute("disabled") ||
          el.getAttribute("aria-disabled") === "true";
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const topEl =
          Number.isFinite(cx) && Number.isFinite(cy)
            ? document.elementFromPoint(cx, cy)
            : null;
        const covered = !!(
          topEl &&
          topEl !== el &&
          !el.contains(topEl) &&
          !topEl.closest?.(`[data-nav-tab="${want}"]`)
        );
        return {
          path: pathName,
          routeKind,
          ux,
          allTabs: all,
          present: true,
          visible,
          inert,
          disabled,
          covered,
          actionable: visible && !inert && !disabled,
          navImpl: navHost?.getAttribute("data-bottom-nav-implementation"),
          bodyHasNav,
          ready: true,
        };
      }, tab);
    }

    function isMainRoutePath(pathname) {
      return MAIN_TAB_PATHS.has(String(pathname || "").split("?")[0]);
    }

    function classifyNavTimeout(snap, err) {
      const msg = String(err?.message || err || "");
      if (isContextDestroyedError(err)) return "NAV_FRAME_CONTEXT_SWAP";
      if (!snap) return "NAV_UNKNOWN";
      const main = isMainRoutePath(snap.path);
      const nonMain =
        !main ||
        snap.routeKind === "profile" ||
        snap.routeKind === "profile-chat" ||
        snap.routeKind === "chat-thread" ||
        snap.routeKind === "non-main";
      if (!snap.present) {
        // Product intentionally hides bottom nav on modern+/shuffle.
        if (snap.ux === "modern" && snap.path === "/shuffle") {
          return "NAV_HIDDEN_OR_INERT";
        }
        if (nonMain && !main) return "NAV_ABSENT_NON_MAIN_EXPECTED";
        if (!snap.ready) return "NAV_SHELL_NOT_READY";
        if (main) return "NAV_ABSENT_PRODUCT_BUG";
        return "NAV_ABSENT_NON_MAIN_EXPECTED";
      }
      if (snap.inert || snap.disabled || !snap.visible) {
        return "NAV_HIDDEN_OR_INERT";
      }
      if (/strict mode violation|not visible|not enabled/i.test(msg)) {
        return "NAV_HIDDEN_OR_INERT";
      }
      if (/Timeout/i.test(msg) && snap.present) return "NAV_LOCATOR_STALE";
      // Attached nodes exist elsewhere but wanted tab missing → selector drift.
      if (!snap.allTabs?.includes?.("shuffle") && snap.allTabs?.length > 0) {
        return "NAV_SELECTOR_CHANGED";
      }
      return "NAV_UNKNOWN";
    }

    async function readShellReadyProbe() {
      return page.evaluate(() => {
        const pathName = location.pathname;
        const main = [
          "/chats",
          "/shuffle",
          "/boost",
          "/settings",
          "/stories",
        ].includes(pathName);
        const tabCount = document.querySelectorAll("[data-nav-tab]").length;
        const bodyHasNav = document.body.classList.contains(
          "sayittome-has-bottom-nav",
        );
        const navHost = !!document.querySelector(
          "[data-bottom-nav-implementation]",
        );
        const ready = !main || bodyHasNav || navHost || tabCount > 0;
        return {
          path: pathName,
          main,
          ready,
          bodyHasNav,
          navHost,
          tabCount,
          readyState: document.readyState,
          ux: document.documentElement.getAttribute("data-ux"),
          routeKind: document.documentElement.getAttribute(
            "data-sayittome-route-kind",
          ),
          bodyTextLen: (document.body?.innerText || "").length,
        };
      });
    }

    async function ensureMainShellReady(timeoutMs = 12_000) {
      // Bounded wait for main-tab chrome. Returns readiness; never pretends PASS.
      const t0 = Date.now();
      try {
        await page.waitForFunction(
          () => {
            const pathName = location.pathname;
            const main = [
              "/chats",
              "/shuffle",
              "/boost",
              "/settings",
              "/stories",
            ].includes(pathName);
            if (!main) return true; // non-main handled by tapNav classification
            return (
              document.body.classList.contains("sayittome-has-bottom-nav") ||
              !!document.querySelector("[data-bottom-nav-implementation]") ||
              document.querySelectorAll("[data-nav-tab]").length > 0
            );
          },
          { timeout: timeoutMs },
        );
        const waited = Date.now() - t0;
        metrics.navShellReadyWaitMsTotal += waited;
        return { ready: true, waitedMs: waited, probe: await readShellReadyProbe() };
      } catch {
        const waited = Date.now() - t0;
        metrics.navShellReadyWaitMsTotal += waited;
        return {
          ready: false,
          waitedMs: waited,
          probe: await readShellReadyProbe().catch(() => null),
        };
      }
    }

    async function ensureMainShellReadyOrRecover() {
      let shell = await ensureMainShellReady(12_000);
      if (shell.ready) return shell;
      // Setup recovery for intermittent unhydrated main route (08e270a matrix-slow
      // iter49): one seed re-enter — NOT a second Shuffle tap.
      metrics.recoveryRedirectCount += 1;
      noteLife("shell-not-ready-seed-reenter", {
        probe: shell.probe,
        waitedMs: shell.waitedMs,
      });
      await page.goto(`${base}/${seed}?navcapture=1&_bd=${Date.now()}`, {
        waitUntil: "load",
        timeout: 90_000,
      });
      await page.waitForTimeout(400);
      shell = await ensureMainShellReady(15_000);
      if (shell.ready) {
        metrics.navShellReadyRecoveredCount += 1;
      }
      return shell;
    }

    async function tapNav(dest) {
      metrics.navTabLookupCount += 1;
      const shell = await ensureMainShellReadyOrRecover();
      let snap = await readNavSnapshot(dest).catch(() => null);
      if (
        shell &&
        !shell.ready &&
        snap &&
        isMainRoutePath(snap.path) &&
        !snap.present &&
        !snap.ready
      ) {
        metrics.navLocatorTimeoutCount += 1;
        metrics.navLocatorTimeoutClassifiedCount += 1;
        metrics.navShellNotReadyCount += 1;
        metrics.navTimeoutClassified.NAV_SHELL_NOT_READY += 1;
        if (metrics.navTimeoutSamples.length < 12) {
          metrics.navTimeoutSamples.push({
            dest,
            classification: "NAV_SHELL_NOT_READY",
            snap,
            shellReadyMs: shell.waitedMs,
            shellProbe: shell.probe,
            msg: "main-shell-not-ready-after-seed-reenter",
          });
        }
        throw new Error(
          `NAV_SHELL_NOT_READY:tapNav:${dest}:path=${snap.path}:shellReadyMs=${shell.waitedMs}`,
        );
      }
      if (snap?.present) metrics.navTabFoundCount += 1;
      else metrics.navTabMissingCount += 1;
      if (snap?.visible) metrics.navTabVisibleCount += 1;
      if (snap && snap.present && !snap.visible) metrics.navTabHiddenCount += 1;
      if (snap?.inert) metrics.navTabInertCount += 1;
      if (snap?.disabled) metrics.navTabDisabledCount += 1;
      if (snap?.covered) metrics.navTabCoveredCount += 1;
      if (snap?.actionable) metrics.navTabActionableCount += 1;

      // Precondition: never blind-tap bottom nav on non-main routes.
      if (snap && !isMainRoutePath(snap.path)) {
        metrics.navNonMainPreconditionCount += 1;
        // Deterministic recovery: hard-enter seed main route once (not a retry of tap).
        await page.goto(`${base}/${seed}?navcapture=1&_bd=${Date.now()}`, {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
        await page.waitForTimeout(500);
        await ensureMainShellReady();
        snap = await readNavSnapshot(dest).catch(() => null);
        if (!snap?.present && isMainRoutePath(snap?.path || "")) {
          metrics.navMainRouteAbsentCount += 1;
          metrics.navLocatorTimeoutCount += 1;
          metrics.navLocatorTimeoutClassifiedCount += 1;
          metrics.navTimeoutClassified.NAV_ABSENT_PRODUCT_BUG += 1;
          throw new Error(
            `NAV_ABSENT_PRODUCT_BUG:${dest}:path=${snap?.path}`,
          );
        }
      }

      const loc = page.locator(`[data-nav-tab="${dest}"]`).first();
      try {
        await loc.waitFor({ state: "attached", timeout: 20_000 });
      } catch (err) {
        metrics.navLocatorTimeoutCount += 1;
        // Re-read after timeout for accurate classification (no second tap).
        const after = await readNavSnapshot(dest).catch(() => snap);
        const classification = classifyNavTimeout(after || snap, err);
        metrics.navTimeoutClassified[classification] =
          (metrics.navTimeoutClassified[classification] || 0) + 1;
        if (classification === "NAV_UNKNOWN") {
          metrics.navLocatorTimeoutUnclassifiedCount += 1;
        } else {
          metrics.navLocatorTimeoutClassifiedCount += 1;
        }
        if (classification === "NAV_ABSENT_PRODUCT_BUG") {
          metrics.navMainRouteAbsentCount += 1;
        }
        if (classification === "NAV_SHELL_NOT_READY") {
          metrics.navShellNotReadyCount += 1;
        }
        if (classification === "NAV_SELECTOR_CHANGED") {
          metrics.navSelectorChangedCount += 1;
        }
        if (classification === "NAV_ABSENT_NON_MAIN_EXPECTED") {
          metrics.navNonMainPreconditionCount += 1;
        }
        if (metrics.navTimeoutSamples.length < 12) {
          metrics.navTimeoutSamples.push({
            dest,
            classification,
            snap: after || snap,
            msg: String(err?.message || err).slice(0, 300),
          });
        }
        // Structured failure — never leave Playwright TimeoutError uncaught.
        throw new Error(
          `${classification}:tapNav:${dest}:path=${(after || snap)?.path || "?"}`,
        );
      }

      // Prefer pointerdown+click via evaluate so BottomNavLink supersede / exit
      // handoff arms the same way as real touch (Playwright force-click alone can
      // skip React onPointerDown and leave sayittome-shuffle-handoff-pending).
      try {
        await page.evaluate((tab) => {
          const el = document.querySelector(`[data-nav-tab="${tab}"]`);
          if (!el) throw new Error(`missing-tab-${tab}`);
          el.dispatchEvent(
            new PointerEvent("pointerdown", {
              bubbles: true,
              cancelable: true,
              pointerType: "touch",
            }),
          );
          el.click();
        }, dest);
      } catch {
        metrics.staleLocatorCount += 1;
        metrics.locatorClickFallbackCount += 1;
        try {
          await loc.click({ force: true, timeout: 5_000 });
          metrics.staleLocatorRecoveredCount += 1;
        } catch {
          metrics.staleLocatorUnresolvedCount += 1;
          metrics.navLocatorTimeoutCount += 1;
          metrics.navLocatorTimeoutClassifiedCount += 1;
          metrics.navTimeoutClassified.NAV_LOCATOR_STALE += 1;
          throw new Error(`NAV_LOCATOR_STALE:tapNav-unresolved-${dest}`);
        }
      }
    }
    // Seed shell must be contractual-ready before first tapNav (slow-matrix iter49).
    {
      const seedShell = await ensureMainShellReadyOrRecover();
      noteLife("seed-shell-ready", {
        ready: seedShell.ready,
        waitedMs: seedShell.waitedMs,
        shellReadyMs: seedShell.waitedMs,
        probe: seedShell.probe,
      });
      if (!seedShell.ready) {
        const msg = `NAV_SHELL_NOT_READY:seed:${seed}:shellReadyMs=${seedShell.waitedMs}`;
        results.push({
          i,
          mismatch: 0,
          sampled: 0,
          pathFinal: seedShell.probe?.path || null,
          storiesFinal: false,
          chatsFinal: false,
          navMiss: true,
          selectedMiss: false,
          destroyedCount: 0,
          destroyedClassified: [],
          failureClass: "NAV_SHELL_NOT_READY",
          setupError: msg,
          lifecycleTail: lifecycle.slice(-12),
        });
        metrics.navShellNotReadyCount += 1;
        metrics.navLocatorTimeoutCount += 1;
        metrics.navLocatorTimeoutClassifiedCount += 1;
        metrics.navTimeoutClassified.NAV_SHELL_NOT_READY += 1;
        await ctx.close();
        continue;
      }
    }

    let setupError = null;
    try {
      if (mode === "stories-shuffle-stories") {
        if (seed !== "stories") {
          if (seed !== "shuffle") {
            await tapNav("shuffle");
            await page.waitForURL("**/shuffle", { timeout: 15_000 }).catch(() => {});
            await page.waitForTimeout(400);
          }
          await tapNav("stories");
          await page.waitForURL("**/stories", { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(400);
        }
        await tapNav("shuffle");
        await page.waitForURL("**/shuffle", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(400);
        await tapNav("stories");
      } else if (mode === "main-to-stories") {
        if (seed !== "stories") {
          await tapNav("stories");
        }
      } else {
        if (seed !== "shuffle") {
          await tapNav("shuffle");
          await page.waitForURL("**/shuffle", { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(400);
        }
        await tapNav("stories");
      }
    } catch (err) {
      setupError = err;
    }

    if (setupError) {
      const msg = String(setupError?.message || setupError);
      const classification =
        msg.split(":")[0] || "NAV_UNKNOWN";
      const known = [
        "NAV_ABSENT_PRODUCT_BUG",
        "NAV_ABSENT_NON_MAIN_EXPECTED",
        "NAV_SELECTOR_CHANGED",
        "NAV_SHELL_NOT_READY",
        "NAV_LOCATOR_STALE",
        "NAV_HIDDEN_OR_INERT",
        "NAV_FRAME_CONTEXT_SWAP",
        "NAV_UNKNOWN",
      ];
      const failureClass = known.includes(classification)
        ? classification
        : "NAV_UNKNOWN";
      if (failureClass === "NAV_UNKNOWN") {
        metrics.navLocatorTimeoutUnclassifiedCount += 1;
        metrics.navTimeoutClassified.NAV_UNKNOWN += 1;
      }
      results.push({
        i,
        mismatch: 0,
        sampled: 0,
        pathFinal: (() => {
          try {
            return new URL(page.url()).pathname;
          } catch {
            return null;
          }
        })(),
        storiesFinal: false,
        chatsFinal: false,
        navMiss: true,
        selectedMiss: false,
        destroyedCount: 0,
        destroyedClassified: [],
        failureClass,
        setupError: msg.slice(0, 400),
        lifecycleTail: lifecycle.slice(-12),
      });
      await ctx.close();
      continue;
    }

    // Do not sample across the Stories commit navigation.
    await page.waitForURL("**/stories", { timeout: 20_000 }).catch(() => {});
    await page
      .waitForFunction(
        () =>
          location.pathname === "/stories" &&
          !document.documentElement.classList.contains(
            "sayittome-shuffle-exit-handoff-pending",
          ),
        { timeout: 10_000 },
      )
      .catch(() => {});

    const samples = [];
    const destroyedEvents = [];
    let abortedFail = null;
    const start = Date.now();
    while (Date.now() - start < waitMs && !abortedFail) {
      const urlBefore = page.url();
      const lifeBeforeLen = lifecycle.length;
      try {
        const sample = await readTabConsistencySample(page);
        samples.push(sample);
        if (sample.navPerfType === "reload" || sample.navLegacyType === 1) {
          metrics.unexpectedHardReloadCount += 1;
        }
        if (sample.loadingTextAnywhereCountRaw > 0) {
          metrics.loadingTextAnywhereCountRaw += 1;
        }
        if ((sample.visibleLoadingTextCount || 0) > 0) {
          metrics.visibleLoadingTextCount += sample.visibleLoadingTextCount;
          metrics.loadingTextAnywhereCount += 1;
        }
        if ((sample.activePanelLoadingTextCount || 0) > 0) {
          metrics.activePanelLoadingTextCount +=
            sample.activePanelLoadingTextCount;
        }
        metrics.hiddenLoadingTextCount += sample.hiddenLoadingTextCount || 0;
        metrics.inactivePanelLoadingTextCount +=
          sample.inactivePanelLoadingTextCount || 0;
        metrics.residualDomLoadingTextCount +=
          sample.residualDomLoadingTextCount || 0;
        if (
          (sample.visibleLoadingTextCount || 0) > 0 &&
          metrics.loadingMatchSamples.length < 8
        ) {
          metrics.loadingMatchSamples.push({
            i,
            t: sample.t,
            path: sample.path,
            matches: sample.loadingMatches || [],
          });
        }
      } catch (err) {
        metrics.contextDestroyedCount += 1;
        const msg = String(err?.message || err);
        const recent = lifecycle.slice(lifeBeforeLen);
        const hadFrameNav =
          recent.some((e) => e.type === "framenavigated") ||
          lifecycle.slice(-6).some((e) => e.type === "framenavigated");
        let classification = "UNKNOWN";
        if (!isContextDestroyedError(err)) {
          classification = "UNKNOWN";
        } else if (
          hadFrameNav &&
          /\/stories/.test(urlBefore) &&
          /\/stories/.test(page.url())
        ) {
          classification = "SPA_NAV_CONTEXT_SWAP";
          metrics.expectedSpaNavContextSwapCount += 1;
        } else if (hadFrameNav && !/\/stories/.test(page.url())) {
          classification = "UNEXPECTED_NAV";
          metrics.recoveryRedirectCount += 1;
        } else if (!hadFrameNav) {
          // Mid-sample race with Soft/SPA commit that Playwright did not yet
          // expose as framenavigated — re-read after settle; not a pass by itself.
          classification = "PROBE_STALE_CONTEXT";
        }
        metrics.contextDestroyedClassified[classification] =
          (metrics.contextDestroyedClassified[classification] || 0) + 1;
        destroyedEvents.push({
          t: Date.now(),
          classification,
          msg: msg.slice(0, 300),
          urlBefore,
          urlAfter: page.url(),
          recent,
        });

        // Fail-closed: unknown / unexpected nav cannot be hidden by retry.
        if (
          classification === "UNKNOWN" ||
          classification === "UNEXPECTED_NAV" ||
          classification === "HARD_RELOAD"
        ) {
          abortedFail = {
            i,
            mismatch: 0,
            sampled: samples.length,
            pathFinal: (() => {
              try {
                return new URL(page.url()).pathname;
              } catch {
                return null;
              }
            })(),
            storiesFinal: false,
            chatsFinal: false,
            navMiss: true,
            selectedMiss: false,
            destroyedCount: destroyedEvents.length,
            destroyedClassified: destroyedEvents.map((d) => d.classification),
            failureClass: `CONTEXT_DESTROYED_${classification}`,
            destroyedEvents,
            lifecycleTail: lifecycle.slice(-12),
          };
          break;
        }

        // Expected SPA swap / stale probe read: re-acquire and continue sampling.
        await page
          .waitForURL("**/stories", { timeout: 5_000 })
          .catch(() => {});
        await page.waitForTimeout(50);
        try {
          const recovered = await readTabConsistencySample(page);
          samples.push({ ...recovered, recoveredAfterContextSwap: true });
        } catch (err2) {
          metrics.contextDestroyedCount += 1;
          metrics.contextDestroyedClassified.UNKNOWN += 1;
          abortedFail = {
            i,
            mismatch: 0,
            sampled: samples.length,
            pathFinal: null,
            storiesFinal: false,
            chatsFinal: false,
            navMiss: true,
            selectedMiss: false,
            destroyedCount: destroyedEvents.length + 1,
            destroyedClassified: [
              ...destroyedEvents.map((d) => d.classification),
              "UNKNOWN",
            ],
            failureClass: "CONTEXT_DESTROYED_UNKNOWN",
            destroyedEvents: [
              ...destroyedEvents,
              {
                t: Date.now(),
                classification: "UNKNOWN",
                msg: String(err2?.message || err2).slice(0, 300),
              },
            ],
          };
          break;
        }
      }
      await page.waitForTimeout(100);
    }

    if (abortedFail) {
      results.push(abortedFail);
      await ctx.close();
      continue;
    }

    // Ignore first 400ms after tap (exit latch / commit window).
    const afterSettle = samples.filter(
      (s) => !s.exitPending && s.path === "/stories" && s.t >= start + 400,
    );
    // Contract: route/nav/content match. Leftover entry handoff class alone is
    // not a fail if Stories is visible and Chats is not.
    const mismatch = afterSettle.filter(
      (s) => s.chatsVisible || !s.storiesVisible,
    );
    const last = samples.at(-1);
    const navMiss =
      last?.path !== "/stories" ||
      (afterSettle.length === 0 && last?.path === "/shuffle");
    const selectedMiss =
      afterSettle.length > 0 &&
      afterSettle.some(
        (s) => s.selectedNav != null && s.selectedNav !== "stories",
      );
    // Stories is a concrete main tab; routeKind is typically "main-tab".
    // Only sticky non-main kinds (e.g. profile) are mismatches on /stories.
    const routeKindMiss = afterSettle.some(
      (s) =>
        s.path === "/stories" &&
        s.routeKind != null &&
        s.routeKind !== "stories" &&
        s.routeKind !== "main" &&
        s.routeKind !== "main-tab",
    );
    if (mismatch.length) metrics.contentMismatchCount += mismatch.length;
    if (navMiss) metrics.navMismatchCount += 1;
    if (selectedMiss) metrics.selectedMismatchCount += 1;
    if (routeKindMiss) metrics.routeMismatchCount += 1;
    if (metrics.unexpectedHardReloadCount > 0) {
      metrics.contextDestroyedClassified.HARD_RELOAD += 1;
    }

    const hardReloadFail = samples.some(
      (s) => s.navPerfType === "reload" || s.navLegacyType === 1,
    );
    const unknownDestroyed = destroyedEvents.some(
      (d) => d.classification === "UNKNOWN",
    );
    const unexpectedDestroyed = destroyedEvents.some(
      (d) =>
        d.classification === "UNEXPECTED_NAV" ||
        d.classification === "HARD_RELOAD",
    );

    let failureClass = null;
    if (hardReloadFail || unexpectedDestroyed) {
      failureClass = "UNEXPECTED_HARD_RELOAD_OR_NAV";
    } else if (unknownDestroyed) {
      failureClass = "CONTEXT_DESTROYED_UNKNOWN";
    } else if (navMiss) {
      failureClass = "SHUFFLE_STORIES_NAV_NOT_COMMITTED";
    } else if (mismatch.length > 0) {
      failureClass = "SHUFFLE_STORIES_PANEL_MISMATCH";
    } else if (selectedMiss || routeKindMiss) {
      failureClass = "ROUTE_NAV_CONTENT_MISMATCH";
    }

    results.push({
      i,
      mismatch: mismatch.length,
      sampled: afterSettle.length,
      pathFinal: last?.path,
      storiesFinal: last?.storiesVisible,
      chatsFinal: last?.chatsVisible,
      handoffFinal: last?.handoffPending,
      htmlFinal: last?.htmlClass,
      storiesClassFinal: last?.storiesClass,
      chatsClassFinal: last?.chatsClass,
      routeKindFinal: last?.routeKind ?? null,
      navMiss,
      selectedMiss,
      destroyedCount: destroyedEvents.length,
      destroyedClassified: destroyedEvents.map((d) => d.classification),
      failureClass,
      lifecycleTail: lifecycle.slice(-8),
    });
    await ctx.close();
  }
  await browser.close();

  const handoffPendingOnStories = results.some(
    (r) => r.pathFinal === "/stories" && r.handoffFinal,
  );
  const pass = results.every(
    (r) =>
      r.mismatch === 0 &&
      r.pathFinal === "/stories" &&
      r.storiesFinal &&
      !r.navMiss &&
      !r.selectedMiss &&
      !r.failureClass &&
      !r.handoffFinal,
  );
  // Fail-closed metrics aligned with staged-rollout contract.
  const metricsFail =
    (metrics.contextDestroyedClassified.UNKNOWN || 0) > 0 ||
    metrics.unexpectedHardReloadCount > 0 ||
    (metrics.contextDestroyedClassified.UNEXPECTED_NAV || 0) > 0 ||
    metrics.routeMismatchCount > 0 ||
    metrics.contentMismatchCount > 0 ||
    metrics.navMismatchCount > 0 ||
    metrics.selectedMismatchCount > 0 ||
    metrics.staleTxActivationCount > 0 ||
    metrics.recoveryRedirectCount > 0 ||
    metrics.visibleLoadingTextCount > 0 ||
    metrics.activePanelLoadingTextCount > 0 ||
    metrics.staleLocatorUnresolvedCount > 0 ||
    metrics.navMainRouteAbsentCount > 0 ||
    metrics.navLocatorTimeoutUnclassifiedCount > 0 ||
    metrics.navSelectorChangedCount > 0 ||
    (metrics.navTimeoutClassified.NAV_ABSENT_PRODUCT_BUG || 0) > 0 ||
    (metrics.navTimeoutClassified.NAV_UNKNOWN || 0) > 0 ||
    handoffPendingOnStories;
  const contractPass = pass && !metricsFail;
  const failed = results.filter(
    (r) =>
      r.mismatch > 0 ||
      !r.storiesFinal ||
      r.pathFinal !== "/stories" ||
      r.failureClass,
  );
  const label =
    mode === "stories-shuffle-stories"
      ? "STORIES_SHUFFLE_STORIES_STAYS_STORIES_FOR_5S"
      : `FROM_${String(fromTab).toUpperCase()}_SHUFFLE_TO_STORIES_STAYS_STORIES_FOR_5S`;
  const overallPass = contractPass;
  check(label, overallPass, {
    repeat,
    fromTab,
    mode,
    waitMs,
    failCount: failed.length,
    contractPass,
    // Persist failing samples (not only the first 3 passes) for forensics.
    results: failed.length > 0 ? failed : results.slice(0, 3),
    failureClasses: [
      ...new Set(failed.map((r) => r.failureClass).filter(Boolean)),
    ],
    metrics,
  });
  // Keep legacy name when default chats→shuffle→stories.
  if (mode === "shuffle-to-stories" && fromTab === "chats") {
    check("SHUFFLE_TO_STORIES_STAYS_STORIES_FOR_5S", overallPass, {
      repeat,
      failCount: failed.length,
      contractPass,
      failureClasses: [
        ...new Set(failed.map((r) => r.failureClass).filter(Boolean)),
      ],
      metrics,
    });
  }
  return overallPass;
}

if (live) {
  await liveProbe();
} else {
  check(
    "SHUFFLE_TO_STORIES_STAYS_STORIES_FOR_5S",
    true,
    { skipped: "static-only; pass --live for browser probe" },
  );
}

const failed = checks.filter((c) => !c.pass);
const out = {
  gate: "TAB_ROUTE_CONTENT_CONSISTENCY_GATE",
  pass: failed.length === 0,
  failedCount: failed.length,
  checks,
  live,
  base: live ? base : null,
};
console.log(JSON.stringify(out, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
