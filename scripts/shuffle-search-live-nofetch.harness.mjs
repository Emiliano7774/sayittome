/**
 * SHUFFLE_SEARCH_LIVE_NOFETCH live gate.
 * Typing must not issue /api/shuffle or new Firestore query sessions.
 * Existing Firestore Listen/channel keepalives are classified as background
 * (not keypress-attributed) — real /api/shuffle in the typing window is FAIL.
 *
 * Reports pool=full&force, countOnly, and ?q= separately (never ignored).
 *
 *   node scripts/shuffle-search-live-nofetch.harness.mjs --base http://127.0.0.1:3010 --repeat 20
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const guardSrc = fs.readFileSync(
  path.join(root, "src/lib/shuffle/shuffleSearchTypingGuard.ts"),
  "utf8",
);
const poolSrc = fs.readFileSync(
  path.join(root, "src/hooks/useShufflePool.ts"),
  "utf8",
);
if (
  !guardSrc.includes("ensureShuffleSearchTypingGuardInstalled") ||
  !guardSrc.includes("markShuffleSearchFocused") ||
  !guardSrc.includes("searchFocused") ||
  !poolSrc.includes("ensureShuffleSearchTypingGuardInstalled")
) {
  console.error(
    JSON.stringify({
      gate: "SHUFFLE_SEARCH_LIVE_NOFETCH",
      pass: false,
      fail: "TYPING_GUARD_DOM_BRIDGE_MISSING",
    }),
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const base = args.includes("--base")
  ? args[args.indexOf("--base") + 1]
  : "http://127.0.0.1:3010";
const repeat = Math.max(
  1,
  Number(args[args.indexOf("--repeat") + 1] || 20) || 20,
);

function isShuffleApi(u) {
  return String(u).includes("/api/shuffle");
}

function isFirestore(u) {
  return String(u).includes("firestore.googleapis.com");
}

function isListenChannel(u) {
  return String(u).includes("/Listen/channel");
}

function isPoolFullForce(u) {
  const s = String(u);
  return s.includes("/api/shuffle") && s.includes("pool=full") && s.includes("force=1");
}

function isCountOnly(u) {
  const s = String(u);
  return s.includes("/api/shuffle") && s.includes("countOnly=1");
}

function isShuffleQ(u) {
  return /\/api\/shuffle[^#]*[?&]q=/.test(String(u));
}

/**
 * Typing-window attributed traffic (must be empty):
 * - any /api/shuffle (the prod critical failure mode)
 * - Firestore REST that is NOT Listen/channel long-poll
 * Listen/channel packets (keepalive or late session establish) are background —
 * not caused by search onChange — and must not mask /api/shuffle failures.
 */
function isKeypressAttributed(u) {
  if (isShuffleApi(u)) return true;
  if (!isFirestore(u)) return false;
  if (isListenChannel(u)) return false;
  return true;
}

const browser = await chromium
  .launch({ channel: "chrome", headless: true })
  .catch(() => chromium.launch({ headless: true }));

let fail = 0;
const samples = [];
const totals = {
  keypressFetches: 0,
  poolFullForce: 0,
  countOnly: 0,
  shuffleQ: 0,
  attributedFirestore: 0,
  backgroundListen: 0,
};

for (let i = 0; i < repeat; i++) {
  if (i > 0 && i % 25 === 0) {
    try {
      fs.appendFileSync(
        process.env.NOFETCH_PROGRESS_LOG || "nul",
        `nofetch progress ${i}/${repeat} fail=${fail}\n`,
      );
    } catch {
      /* ignore */
    }
  }
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
  });
  try {
    const page = await ctx.newPage();
    const fetches = [];
    page.on("request", (req) => {
      const u = req.url();
      if (isShuffleApi(u) || isFirestore(u)) {
        fetches.push({
          t: Date.now(),
          u: u.slice(0, 220),
          method: req.method(),
          resourceType: req.resourceType(),
        });
      }
    });
    await page.goto(`${base}/shuffle?_bd=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(2500);
    const input = page
      .locator(
        'input[placeholder*="Buscar"], input[name="search"], input[type="search"], input[aria-label*="Buscar"]',
      )
      .first();
    const hasInput = (await input.count()) > 0;
    if (!hasInput) {
      fail += 1;
      samples.push({ i, fail: "NO_SEARCH_INPUT" });
      continue;
    }
    // Typing window starts at focus/click — same as product typing-guard arming.
    const beforeFetches = fetches.length;
    const windowStartedAt = Date.now();
    await input.click({ timeout: 10_000 }).catch(() => {});
    await input.fill("");
    await input.type("a", { delay: 40 });
    await page.waitForTimeout(400);
    await input.type("n", { delay: 40 });
    await page.waitForTimeout(700);
    const windowFetches = fetches
      .slice(beforeFetches)
      .filter((f) => f.t >= windowStartedAt);
    const keypressFetches = windowFetches.filter((f) => isShuffleApi(f.u));
    const poolFullForce = keypressFetches.filter((f) => isPoolFullForce(f.u));
    const countOnly = keypressFetches.filter((f) => isCountOnly(f.u));
    const shuffleQ = keypressFetches.filter((f) => isShuffleQ(f.u));
    const attributedFirestore = windowFetches.filter(
      (f) => isKeypressAttributed(f.u) && isFirestore(f.u),
    );
    const backgroundListen = windowFetches.filter((f) => isListenChannel(f.u));
    const value = await input.inputValue().catch(() => "");
    totals.keypressFetches += keypressFetches.length;
    totals.poolFullForce += poolFullForce.length;
    totals.countOnly += countOnly.length;
    totals.shuffleQ += shuffleQ.length;
    totals.attributedFirestore += attributedFirestore.length;
    totals.backgroundListen += backgroundListen.length;
    const ok =
      value.includes("an") &&
      keypressFetches.length === 0 &&
      attributedFirestore.length === 0;
    if (!ok) {
      fail += 1;
      samples.push({
        i,
        value,
        keypressFetches: keypressFetches.length,
        poolFullForce: poolFullForce.length,
        countOnly: countOnly.length,
        shuffleQ: shuffleQ.length,
        attributedFirestore: attributedFirestore.length,
        backgroundListen: backgroundListen.length,
        urls: keypressFetches.concat(attributedFirestore).map((f) => f.u),
      });
    }
  } catch (err) {
    fail += 1;
    samples.push({
      i,
      fail: "ITERATION_ERROR",
      message: String(err?.message || err).slice(0, 200),
    });
  } finally {
    await ctx.close().catch(() => {});
  }
}
await browser.close();

const pass = fail === 0;
console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_SEARCH_LIVE_NOFETCH",
      pass,
      fail,
      repeat,
      totals,
      samples: samples.slice(0, 8),
      attribution:
        "Listen/channel = background (not keypress); ANY /api/shuffle in typing window (incl pool=full&force + countOnly + ?q) = FAIL",
      backendDelta: 0,
    },
    null,
    2,
  ),
);
process.exit(pass ? 0 : 1);
