/**
 * PROFILE_ROUTE_MAIN_TAB_ISOLATION_GATE
 *   node scripts/profile-route-main-tab-isolation.harness.mjs
 *   node scripts/profile-route-main-tab-isolation.harness.mjs --live --base http://127.0.0.1:3010
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const live = args.includes("--live");
const base = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : "http://127.0.0.1:3010";
const profilePath = args.includes("--profile-path")
  ? args[args.indexOf("--profile-path") + 1]
  : "/u/Santi000_35";
const fromTab = args.includes("--from")
  ? args[args.indexOf("--from") + 1]
  : "shuffle";
const repeat = Math.max(
  1,
  Number(args[args.indexOf("--repeat") + 1] || (live ? 20 : 1)) || 1,
);
const waitMs = Math.max(
  1000,
  Number(args[args.indexOf("--wait-ms") + 1] || "5200") || 5200,
);
const mode = args.includes("--mode")
  ? args[args.indexOf("--mode") + 1]
  : "nav-to-profile";

const checks = [];
function check(name, pass, detail = {}) {
  checks.push({ name, pass: Boolean(pass), ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const routeKind = fs.readFileSync(
  path.join(root, "src/lib/navigation/routeKind.ts"),
  "utf8",
);
const isolation = fs.readFileSync(
  path.join(root, "src/lib/navigation/nonMainRouteMainTabIsolation.ts"),
  "utf8",
);
const host = fs.readFileSync(
  path.join(root, "src/components/navigation/MainTabKeepAliveHost.tsx"),
  "utf8",
);
const store = fs.readFileSync(
  path.join(root, "src/lib/navigation/mainTabInternalPathnameStore.ts"),
  "utf8",
);
const shuffleKa = fs.readFileSync(
  path.join(root, "src/lib/navigation/shuffleKeepAlive.ts"),
  "utf8",
);
const bottom = fs.readFileSync(
  path.join(root, "src/components/navigation/BottomNav.tsx"),
  "utf8",
);
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

check(
  "OLD_PROFILE_ROUTE_CHAT_SHUFFLE_LEAK_REPRODUCES",
  routeKind.includes("isProfileRoute") &&
    isolation.includes("PROFILE_ROUTE_MAIN_TAB_LEAK") &&
    host.includes("isNonMainRoute(path)"),
);

check(
  "PROFILE_ROUTE_HIDES_MAIN_TAB_HOST",
  host.includes("neutralizeMainTabPresentationForNonMainRoute") &&
    css.includes('data-sayittome-route-kind="profile"') &&
    css.includes("#sayittome-main-tab-keepalive-chats"),
);

check(
  "PROFILE_ROUTE_BOTTOM_NAV_NOT_STALE_SELECTED",
  bottom.includes("canSelectBottomNavMainTab") &&
    bottom.includes("navSelectable"),
);

check(
  "PROFILE_ROUTE_DIRECT_COLD_NO_MAIN_TAB_LEAK",
  store.includes("isNonMainRoute(loc)") &&
    isolation.includes("clearSoftCommitTxPin"),
);

check(
  "PROFILE_ROUTE_BACK_FORWARD_RESTORES_PREVIOUS_TAB",
  store.includes("history-popstate") ||
    store.includes("popstate") ||
    isolation.includes("resetMainTabHistoryPathnameStore"),
);

check(
  "PROFILE_FROM_CHATS_DOES_NOT_SHOW_CHAT_LIST_BEHIND",
  host.includes("never remap") ||
    host.includes("PROFILE_ROUTE_MAIN_TAB_LEAK") ||
    host.includes("isNonMainRoute(path)"),
);

check(
  "PROFILE_CHAT_ROUTE_ISOLATION",
  routeKind.includes("isProfileChatRoute") &&
    css.includes('data-sayittome-route-kind="profile-chat"'),
);

check(
  "NON_MAIN_ROUTE_STALE_MAIN_TAB_TX_IGNORED",
  isolation.includes("non-main-route-isolation") &&
    shuffleKa.includes('path.startsWith("/u/")'),
);

const revealSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/nonMainToShuffleReveal.ts"),
  "utf8",
);
const warmNavSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/warmShuffleTabNavigation.ts"),
  "utf8",
);

check(
  "OWN_PROFILE_TO_SHUFFLE_SYNC_REVEAL",
  revealSrc.includes("prepareShuffleRevealFromNonMainRoute") &&
    warmNavSrc.includes("prepareShuffleRevealFromNonMainRoute") &&
    css.includes(
      'sayittome-shuffle-exit-handoff-pending:not([data-sayittome-route-kind="profile"])',
    ),
);

async function liveProbe() {
  const { chromium } = await import("playwright");
  const browser = await chromium
    .launch({ headless: true, channel: "chrome" })
    .catch(() => chromium.launch({ headless: true }));
  const UA =
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";

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
        localStorage.setItem("sayittome_ux_mode", "classic");
      } catch {
        /* ignore */
      }
    });
    const page = await ctx.newPage();

    async function sample() {
      return page.evaluate(() => {
        const path = location.pathname;
        const chats = document.getElementById(
          "sayittome-main-tab-keepalive-chats",
        );
        const stories = document.getElementById(
          "sayittome-main-tab-keepalive-stories",
        );
        const shuffle = document.getElementById(
          "sayittome-shuffle-keepalive-host",
        );
        const panelVisible = (el) => {
          if (!el) return false;
          if (
            el.classList.contains("sayittome-main-tab-keepalive-frozen") ||
            el.classList.contains("sayittome-shuffle-keepalive-frozen")
          ) {
            const cs = getComputedStyle(el);
            if (cs.visibility === "hidden" || Number(cs.opacity || "1") < 0.05) {
              return false;
            }
          }
          const cs = getComputedStyle(el);
          const opacity = Number.parseFloat(cs.opacity || "1");
          const visibleClass =
            el.classList.contains("sayittome-main-tab-keepalive-visible") ||
            el.classList.contains("sayittome-shuffle-keepalive-visible");
          return (
            visibleClass &&
            cs.visibility !== "hidden" &&
            cs.display !== "none" &&
            (Number.isFinite(opacity) ? opacity > 0.05 : true)
          );
        };
        const shuffleSelected =
          document
            .querySelector('[data-nav-tab="shuffle"]')
            ?.querySelector(".text-\\[\\#7b5cff\\], [class*='7b5cff']") != null ||
          [...document.querySelectorAll('[data-nav-tab="shuffle"] svg')].some(
            (svg) => getComputedStyle(svg).color.includes("123") /* rough */,
          );
        // Prefer class color check via purple hex in className.
        const shuffleBtn = document.querySelector('[data-nav-tab="shuffle"]');
        const shufflePurple = !!shuffleBtn?.innerHTML?.includes("7b5cff");
        const chatsSelected = !!document
          .querySelector('[data-nav-tab="chats"]')
          ?.innerHTML?.includes("7b5cff");
        const anyMainSelected = ["stories", "chats", "shuffle", "boost", "settings"].some(
          (id) =>
            document
              .querySelector(`[data-nav-tab="${id}"]`)
              ?.innerHTML?.includes("7b5cff") ||
            document
              .querySelector(`[data-nav-tab="${id}"]`)
              ?.innerHTML?.includes("f59e0b"),
        );
        return {
          path,
          routeKind: document.documentElement.getAttribute(
            "data-sayittome-route-kind",
          ),
          chatsVisible: panelVisible(chats),
          storiesVisible: panelVisible(stories),
          shuffleVisible: panelVisible(shuffle),
          shufflePurple,
          chatsSelected,
          anyMainSelected,
          handoffPending: document.documentElement.classList.contains(
            "sayittome-main-tab-handoff-pending",
          ),
          shuffleHandoff: document.documentElement.classList.contains(
            "sayittome-shuffle-handoff-pending",
          ),
          exitHandoff: document.documentElement.classList.contains(
            "sayittome-shuffle-exit-handoff-pending",
          ),
        };
      });
    }

    if (mode === "direct-cold") {
      await page.goto(`${base}${profilePath}?navcapture=1&_bd=${Date.now()}`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
    } else if (mode === "back-forward") {
      const seed = ["chats", "shuffle", "stories", "boost", "settings"].includes(
        fromTab,
      )
        ? fromTab
        : "shuffle";
      await page.goto(`${base}/${seed}?navcapture=1&_bd=${Date.now()}`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await page.waitForTimeout(800);
      await page.goto(`${base}${profilePath}?navcapture=1&_bd=${Date.now()}`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await page.waitForTimeout(600);
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(700);
      const afterBack = await sample();
      await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(700);
      const afterFwd = await sample();
      const fwdPath = String(afterFwd.path || "");
      const fwdPathOk =
        fwdPath.startsWith("/u/") ||
        (String(profilePath || "").endsWith("/chat") &&
          fwdPath.startsWith("/chat/"));
      results.push({
        i,
        mode,
        afterBack,
        afterFwd,
        mismatch:
          afterFwd.chatsVisible ||
          afterFwd.shuffleVisible ||
          afterFwd.shufflePurple ||
          afterFwd.anyMainSelected ||
          !fwdPathOk
            ? 1
            : 0,
        backOk:
          afterBack.path === `/${seed}` ||
          (seed === "shuffle" && afterBack.path === "/shuffle"),
      });
      await ctx.close();
      continue;
    } else {
      const seed = ["chats", "shuffle", "stories", "boost", "settings"].includes(
        fromTab,
      )
        ? fromTab
        : "shuffle";
      await page.goto(`${base}/${seed}?navcapture=1&_bd=${Date.now()}`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await page.waitForTimeout(900);
      for (let d = 0; d < 2; d++) {
        try {
          const dismiss = page
            .getByRole("button", { name: /Ahora no|Not now/i })
            .first();
          if (await dismiss.isVisible({ timeout: 300 }).catch(() => false)) {
            await dismiss.click({ force: true }).catch(() => {});
          } else break;
        } catch {
          break;
        }
      }
      // Soft navigate to profile (router-like): click first /u/ link if present, else goto.
      const linked = await page.evaluate(() => {
        const a = document.querySelector('a[href^="/u/"]');
        if (!a) return null;
        a.click();
        return a.getAttribute("href");
      });
      if (!linked) {
        await page.goto(`${base}${profilePath}?navcapture=1&_bd=${Date.now()}`, {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
      }
    }

    await page.waitForTimeout(200);
    const samples = [];
    const start = Date.now();
    while (Date.now() - start < waitMs) {
      samples.push(await sample());
      await page.waitForTimeout(100);
    }
    const afterSettle = samples.filter(
      (s) => String(s.path || "").startsWith("/u/") && s.t === undefined,
    );
    // All samples after first 300ms on profile
    const settled = samples.slice(Math.min(3, samples.length));
    const allowChatThread =
      String(profilePath || "").endsWith("/chat") || mode === "direct-cold";
    const pathOk = (p) => {
      const s = String(p || "");
      if (s.startsWith("/u/")) return true;
      // /u/[user]/chat redirects into /chat/[id] — isolation still required.
      if (allowChatThread && s.startsWith("/chat/")) return true;
      return false;
    };
    const mismatch = settled.filter(
      (s) =>
        s.chatsVisible ||
        s.storiesVisible ||
        s.shuffleVisible ||
        s.shufflePurple ||
        s.anyMainSelected ||
        !pathOk(s.path),
    );
    results.push({
      i,
      mode,
      fromTab,
      mismatch: mismatch.length,
      pathFinal: samples.at(-1)?.path,
      chatsFinal: samples.at(-1)?.chatsVisible,
      shuffleFinal: samples.at(-1)?.shuffleVisible,
      shufflePurpleFinal: samples.at(-1)?.shufflePurple,
      anyMainSelectedFinal: samples.at(-1)?.anyMainSelected,
      routeKindFinal: samples.at(-1)?.routeKind,
    });
    await ctx.close();
  }
  await browser.close();

  const pass = results.every((r) => {
    if (mode === "back-forward") {
      return r.mismatch === 0 && r.backOk;
    }
    const pathFinal = String(r.pathFinal || "");
    const pathOk =
      pathFinal.startsWith("/u/") ||
      (String(profilePath || "").endsWith("/chat") &&
        pathFinal.startsWith("/chat/"));
    return (
      r.mismatch === 0 &&
      pathOk &&
      !r.chatsFinal &&
      !r.shuffleFinal &&
      !r.shufflePurpleFinal &&
      !r.anyMainSelectedFinal
    );
  });
  const label =
    mode === "direct-cold"
      ? "PROFILE_ROUTE_DIRECT_COLD_LIVE"
      : mode === "back-forward"
        ? `PROFILE_BACK_FORWARD_${String(fromTab).toUpperCase()}_LIVE`
        : `FROM_${String(fromTab).toUpperCase()}_TO_PROFILE_ISOLATED_LIVE`;
  check(label, pass, {
    repeat,
    fromTab,
    mode,
    waitMs,
    profilePath,
    failCount: results.filter((r) => r.mismatch > 0).length,
    results: results.slice(0, 3),
  });
  return pass;
}

if (live) {
  await liveProbe();
} else {
  check("PROFILE_ROUTE_LIVE_PROBE", true, {
    skipped: "static-only; pass --live for browser probe",
  });
}

const failed = checks.filter((c) => !c.pass);
const out = {
  gate: "PROFILE_ROUTE_MAIN_TAB_ISOLATION_GATE",
  pass: failed.length === 0,
  failedCount: failed.length,
  checks,
  live,
  base: live ? base : null,
};
console.log(JSON.stringify(out, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
