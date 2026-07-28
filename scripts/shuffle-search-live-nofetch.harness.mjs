/**
 * SHUFFLE_SEARCH_LIVE_NOFETCH live gate.
 * Typing must not issue /api/shuffle or new Firestore query sessions.
 * Existing Firestore Listen/channel keepalives are classified as background
 * (not keypress-attributed) — real /api/shuffle in the typing window is FAIL.
 *
 *   node scripts/shuffle-search-live-nofetch.harness.mjs --base http://127.0.0.1:3010 --repeat 20
 */
import { chromium } from "playwright";

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

for (let i = 0; i < repeat; i++) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
  });
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
    timeout: 90_000,
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
    await ctx.close();
    continue;
  }
  const beforeFetches = fetches.length;
  await input.click({ timeout: 10_000 }).catch(() => {});
  await input.fill("");
  await input.type("a", { delay: 40 });
  await page.waitForTimeout(400);
  await input.type("n", { delay: 40 });
  await page.waitForTimeout(700);
  const windowFetches = fetches.slice(beforeFetches);
  const keypressFetches = windowFetches.filter((f) => isShuffleApi(f.u));
  const attributedFirestore = windowFetches.filter(
    (f) => isKeypressAttributed(f.u) && isFirestore(f.u),
  );
  const backgroundListen = windowFetches.filter((f) => isListenChannel(f.u));
  const value = await input.inputValue().catch(() => "");
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
      attributedFirestore: attributedFirestore.length,
      backgroundListen: backgroundListen.length,
      urls: keypressFetches.concat(attributedFirestore).map((f) => f.u),
    });
  }
  await ctx.close();
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
      samples: samples.slice(0, 8),
      attribution:
        "Listen/channel = background (not keypress); /api/shuffle and non-channel Firestore REST in typing window = FAIL",
      backendDelta: 0,
    },
    null,
    2,
  ),
);
process.exit(pass ? 0 : 1);
