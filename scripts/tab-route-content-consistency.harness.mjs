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
    const navEntries = performance.getEntriesByType?.("navigation") || [];
    const nav0 = navEntries[0];
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
      loadingTextAnywhere: /cargando/i.test(document.body?.innerText || ""),
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
    staleLocatorCount: 0,
    routeMismatchCount: 0,
    contentMismatchCount: 0,
    navMismatchCount: 0,
    selectedMismatchCount: 0,
    staleTxActivationCount: 0,
    recoveryRedirectCount: 0,
    loadingTextAnywhereCount: 0,
  };

  const results = [];
  for (let i = 0; i < repeat; i++) {
    const ctx = await browser.newContext({
      userAgent: UA,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem(
          "sayittome-flag-MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE",
          "true",
        );
        // Classic shell keeps bottom nav on /shuffle (modern hides it).
        localStorage.setItem("sayittome_ux_mode", "classic");
      } catch {
        /* ignore */
      }
    });
    const page = await ctx.newPage();
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
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForTimeout(900);
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
    async function tapNav(dest) {
      const loc = page.locator(`[data-nav-tab="${dest}"]`).first();
      await loc.waitFor({ state: "attached", timeout: 20_000 });
      try {
        await loc.click({ force: true, timeout: 5_000 });
      } catch {
        metrics.staleLocatorCount += 1;
        // One synthetic input after locator miss; do not sample across this hop.
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
      }
    }
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
        if (sample.loadingTextAnywhere) metrics.loadingTextAnywhereCount += 1;
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

  const pass = results.every(
    (r) =>
      r.mismatch === 0 &&
      r.pathFinal === "/stories" &&
      r.storiesFinal &&
      !r.navMiss &&
      !r.selectedMiss &&
      !r.failureClass,
  );
  // Fail-closed metrics: unknown context destruction or unexpected hard reload.
  const metricsFail =
    (metrics.contextDestroyedClassified.UNKNOWN || 0) > 0 ||
    metrics.unexpectedHardReloadCount > 0 ||
    (metrics.contextDestroyedClassified.UNEXPECTED_NAV || 0) > 0 ||
    metrics.routeMismatchCount > 0 ||
    metrics.contentMismatchCount > 0 ||
    metrics.navMismatchCount > 0;
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
  const overallPass = pass && !metricsFail;
  check(label, overallPass, {
    repeat,
    fromTab,
    mode,
    waitMs,
    failCount: failed.length,
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
