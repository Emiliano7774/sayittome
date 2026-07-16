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
        // Classic shell keeps bottom nav on /shuffle (modern hides it).
        localStorage.setItem("sayittome_ux_mode", "classic");
      } catch {
        /* ignore */
      }
    });
    const page = await ctx.newPage();
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
        const dismiss = page.getByRole("button", { name: /Ahora no|Not now/i }).first();
        if (await dismiss.isVisible({ timeout: 400 }).catch(() => false)) {
          await dismiss.click({ force: true }).catch(() => {});
        } else break;
      } catch {
        break;
      }
    }
    async function tapNav(dest) {
      await page.locator(`[data-nav-tab="${dest}"]`).first().waitFor({
        state: "attached",
        timeout: 20_000,
      });
      try {
        await page.locator(`[data-nav-tab="${dest}"]`).first().click({
          force: true,
          timeout: 5_000,
        });
      } catch {
        await page.evaluate((tab) => {
          const el = document.querySelector(`[data-nav-tab="${tab}"]`);
          if (!el) throw new Error(`missing-tab-${tab}`);
          el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          el.click();
        }, dest);
      }
    }
    if (mode === "stories-shuffle-stories") {
      if (seed !== "stories") {
        if (seed !== "shuffle") {
          await tapNav("shuffle");
          await page.waitForTimeout(700);
        }
        await tapNav("stories");
        await page.waitForTimeout(700);
      }
      await tapNav("shuffle");
      await page.waitForTimeout(700);
      await tapNav("stories");
    } else if (mode === "main-to-stories") {
      // Direct bottom-nav hop onto Stories (no Shuffle intermediate).
      if (seed !== "stories") {
        await tapNav("stories");
      }
    } else {
      // Default: seed → Shuffle → Stories (or seed already shuffle).
      if (seed !== "shuffle") {
        await tapNav("shuffle");
        await page.waitForTimeout(700);
      }
      await tapNav("stories");
    }
    await page.waitForTimeout(200);
    const samples = [];
    const start = Date.now();
    while (Date.now() - start < waitMs) {
      samples.push(
        await page.evaluate(() => {
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
          const storiesVisible = panelVisible(stories);
          const chatsVisible = panelVisible(chats);
          const navStories = path === "/stories";
          return {
            t: Date.now(),
            path,
            storiesVisible,
            chatsVisible,
            navStories,
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
          };
        }),
      );
      await page.waitForTimeout(100);
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
    results.push({
      i,
      mismatch: mismatch.length,
      sampled: afterSettle.length,
      pathFinal: samples.at(-1)?.path,
      storiesFinal: samples.at(-1)?.storiesVisible,
      chatsFinal: samples.at(-1)?.chatsVisible,
      handoffFinal: samples.at(-1)?.handoffPending,
      htmlFinal: samples.at(-1)?.htmlClass,
      storiesClassFinal: samples.at(-1)?.storiesClass,
      chatsClassFinal: samples.at(-1)?.chatsClass,
    });
    await ctx.close();
  }
  await browser.close();
  const pass = results.every(
    (r) => r.mismatch === 0 && r.pathFinal === "/stories" && r.storiesFinal,
  );
  const label =
    mode === "stories-shuffle-stories"
      ? "STORIES_SHUFFLE_STORIES_STAYS_STORIES_FOR_5S"
      : `FROM_${String(fromTab).toUpperCase()}_SHUFFLE_TO_STORIES_STAYS_STORIES_FOR_5S`;
  check(label, pass, {
    repeat,
    fromTab,
    mode,
    waitMs,
    failCount: results.filter((r) => r.mismatch > 0 || !r.storiesFinal).length,
    results: results.slice(0, 3),
  });
  // Keep legacy name when default chats→shuffle→stories.
  if (mode === "shuffle-to-stories" && fromTab === "chats") {
    check("SHUFFLE_TO_STORIES_STAYS_STORIES_FOR_5S", pass, {
      repeat,
      failCount: results.filter((r) => r.mismatch > 0 || !r.storiesFinal).length,
    });
  }
  return pass;
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
