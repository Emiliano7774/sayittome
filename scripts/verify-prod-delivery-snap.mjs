/**
 * Verify production (or local) delivery after true deploy.
 *
 * Usage:
 *   node scripts/verify-prod-delivery-snap.mjs --expect-sha 8a011fc --out <json>
 *   node scripts/verify-prod-delivery-snap.mjs --expect-sha 8a011fc --base http://127.0.0.1:3010
 *
 * Contract (inviolable):
 *   - exportPresent=true, buildFlag=true, runtimeFlag=true
 *   - buildSha matches expectSha (prefix)
 *   - NEVER PASS on bundle scan alone
 *   - NEVER PASS with buildSha=null or exportPresent=false after budget
 *
 * Fix vs one-shot 1500ms sample:
 *   - fresh context, SW bypass, cache-buster
 *   - bounded poll with backoff until attach budget
 *   - classify EXPORT_ATTACH_TIMEOUT vs EXPORT_MISSING_PERSISTENT / CDN_PROPAGATION_MIXED / etc.
 */
import fs from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const expectSha = arg("--expect-sha", "a4fd65c");
const out = arg("--out");
const base = (arg("--base", "https://sayittome-app.web.app") || "").replace(
  /\/$/,
  "",
);
const budgetMs = Math.max(
  5_000,
  Number(arg("--budget-ms", "45000")) || 45_000,
);
const pollMs = Math.max(200, Number(arg("--poll-ms", "500")) || 500);
const siteHost = "sayittome-app.web.app";

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";

function isProdHost(url) {
  try {
    return new URL(url).hostname === siteHost;
  } catch {
    return false;
  }
}

async function fetchHtmlMeta(url) {
  const started = Date.now();
  const res = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      "User-Agent": UA,
    },
    cache: "no-store",
  });
  const headers = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const html = await res.text();
  const scriptSrcs = [
    ...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g),
  ].map((m) => m[1]);
  return {
    status: res.status,
    headers,
    htmlLen: html.length,
    scriptCount: scriptSrcs.length,
    scriptSrcs,
    elapsedMs: Date.now() - started,
    htmlHasExpect: html.includes(expectSha),
    htmlHasDd28351: html.includes("dd28351"),
  };
}

async function scanChunksForSha(baseUrl, scriptSrcs, sha) {
  let hitExpect = false;
  let hitDd = false;
  let hitChunk = null;
  const samples = [];
  for (const src of scriptSrcs.slice(0, 40)) {
    try {
      const res = await fetch(`${baseUrl}${src}`, {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        cache: "no-store",
      });
      const body = await res.text();
      const hasExpect = body.includes(sha);
      const hasDd = body.includes("dd28351");
      if (hasExpect || hasDd) {
        samples.push({ src, hasExpect, hasDd, len: body.length });
      }
      if (hasExpect) {
        hitExpect = true;
        hitChunk = src;
      }
      if (hasDd) hitDd = true;
    } catch {
      /* ignore chunk fetch errors */
    }
  }
  return { hitExpect, hitDd, hitChunk, samples };
}

function classifyFailure({
  wrongSite,
  snap,
  attempts,
  bundle,
  htmlMeta,
  budgetMs: budget,
}) {
  if (wrongSite) return "WRONG_SITE_CHANNEL";
  if (snap?.buildSha && !String(snap.buildSha).startsWith(expectSha.slice(0, 7))) {
    return "BUILD_SHA_MISMATCH";
  }
  if (snap?.exportPresent === true && snap?.buildSha == null) {
    return "BUILD_SHA_NULL";
  }
  if (snap?.exportPresent === true && snap?.runtimeFlag !== true) {
    return "RUNTIME_FLAG_FALSE";
  }
  if (snap?.exportPresent === true && snap?.buildFlag !== true) {
    return "BUILD_FLAG_FALSE";
  }

  const sawExportLate = attempts.some((a) => a.exportPresent === true);
  const last = attempts[attempts.length - 1] || {};
  const mixed =
    (htmlMeta?.htmlHasDd28351 && bundle?.hitExpect) ||
    (bundle?.hitExpect && bundle?.hitDd);

  if (mixed && last.exportPresent !== true) return "CDN_PROPAGATION_MIXED";

  const cacheHint =
    /hit|stale|age=/i.test(String(htmlMeta?.headers?.["cf-cache-status"] || "")) ||
    /hit/i.test(String(htmlMeta?.headers?.["x-cache"] || "")) ||
    /hit/i.test(String(htmlMeta?.headers?.["x-vercel-cache"] || ""));
  if (
    cacheHint &&
    bundle?.hitExpect &&
    last.exportPresent !== true &&
    String(last.buildSha || "") !== expectSha.slice(0, 7)
  ) {
    return "CACHED_OLD_SHELL";
  }

  if (
    last.exportPresent !== true &&
    bundle?.hitExpect &&
    attempts.length > 0 &&
    attempts[attempts.length - 1].tMs >= budget - pollMs
  ) {
    // Bundle proves new assets; export never attached within budget.
    return "EXPORT_MISSING_PERSISTENT";
  }

  if (last.exportPresent !== true && last.buildSha == null) {
    // Saw no attach within budget (may have been late if we had longer budget).
    if (sawExportLate) return "EXPORT_ATTACH_TIMEOUT";
    return attempts.some((a) => a.tMs >= 1500 && a.exportPresent !== true) &&
      attempts[attempts.length - 1].tMs >= budget - pollMs
      ? "EXPORT_ATTACH_TIMEOUT"
      : "EXPORT_MISSING_PERSISTENT";
  }

  if (last.buildSha == null) return "BUILD_SHA_NULL";
  return "EXPORT_MISSING_PERSISTENT";
}

const startedAt = Date.now();
const cacheBuster = `_bd=${Date.now()}`;
const targetUrl = `${base}/shuffle?navcapture=1&${cacheBuster}`;

let wrongSite = false;
if (isProdHost(base) === false && /web\.app|firebaseapp\.com/i.test(base)) {
  wrongSite = true;
}
if (isProdHost(base) && new URL(base).hostname !== siteHost) {
  wrongSite = true;
}

const htmlMeta = await fetchHtmlMeta(targetUrl).catch((e) => ({
  error: String(e?.message || e),
}));
const bundle =
  htmlMeta?.scriptSrcs?.length > 0
    ? await scanChunksForSha(base, htmlMeta.scriptSrcs, expectSha)
    : { hitExpect: false, hitDd: false, hitChunk: null, samples: [] };

const browser = await chromium
  .launch({ headless: true, channel: "chrome" })
  .catch(() => chromium.launch({ headless: true }));

const ctx = await browser.newContext({
  userAgent: UA,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block",
  ignoreHTTPSErrors: false,
});
await ctx.route("**/*", async (route) => {
  const headers = {
    ...route.request().headers(),
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
  await route.continue({ headers });
});

const page = await ctx.newPage();
const attempts = [];
let snap = null;
let firstExportAtMs = null;
let firstExpectShaAtMs = null;

await page.goto(targetUrl, {
  waitUntil: "domcontentloaded",
  timeout: 90_000,
});

const deadline = Date.now() + budgetMs;
let interval = pollMs;
while (Date.now() <= deadline) {
  const tMs = Date.now() - startedAt;
  const sample = await page.evaluate(() => {
    const exp = window.__microSlideActivationExport;
    const act = typeof exp === "function" ? exp() : null;
    const html = document.documentElement;
    return {
      exportPresent: typeof exp === "function",
      buildFlag: act?.microSlideBuildFlag === true,
      runtimeFlag: act?.microSlideRuntimeEnabled === true,
      buildSha: act?.buildSha ?? null,
      hostname: location.hostname,
      pathname: location.pathname,
      readyState: document.readyState,
      hasChatsBootstrap:
        !!document.querySelector(
          "script[data-sayittome-chats-prepaint], script#sayittome-chats-prepaint-bootstrap",
        ) ||
        /chats-prepaint|prepaintChats|CHATS_PREPAINT/i.test(
          document.documentElement.outerHTML.slice(0, 50000),
        ),
      hasBoostBootstrap:
        /boost-prepaint|prepaintBoost|BOOST_PREPAINT/i.test(
          document.documentElement.outerHTML.slice(0, 50000),
        ) || !!document.querySelector("script[data-sayittome-boost-prepaint]"),
      htmlDatasets: {
        boostSuppress: html.getAttribute("data-boost-handoff-suppress"),
        chatsSuppress: html.getAttribute("data-chats-handoff-suppress"),
        prepaintBoost: html.getAttribute("data-prepaint-boost-handoff-suppress"),
        prepaintChats: html.getAttribute("data-prepaint-chats-handoff-suppress"),
      },
    };
  });
  attempts.push({
    tMs,
    exportPresent: sample.exportPresent,
    buildSha: sample.buildSha,
    buildFlag: sample.buildFlag,
    runtimeFlag: sample.runtimeFlag,
    readyState: sample.readyState,
  });
  if (sample.exportPresent && firstExportAtMs == null) firstExportAtMs = tMs;
  if (
    sample.buildSha &&
    String(sample.buildSha).startsWith(expectSha.slice(0, 7)) &&
    firstExpectShaAtMs == null
  ) {
    firstExpectShaAtMs = tMs;
  }
  snap = sample;

  const ok =
    sample.exportPresent === true &&
    sample.buildFlag === true &&
    sample.runtimeFlag === true &&
    String(sample.buildSha || "").startsWith(expectSha.slice(0, 7));
  if (ok) break;

  // Soft refetch once mid-budget if export still missing but bundle already shows expect sha
  // (helps CDN_PROPAGATION_MIXED / CACHED_OLD_SHELL without unbounded retries).
  if (
    !sample.exportPresent &&
    bundle.hitExpect &&
    tMs > 8_000 &&
    tMs < 12_000 &&
    !attempts.some((a) => a.refetch)
  ) {
    await page.goto(`${base}/shuffle?navcapture=1&_bd=${Date.now()}&r=1`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    attempts.push({ tMs: Date.now() - startedAt, refetch: true });
  }

  await page.waitForTimeout(interval);
  interval = Math.min(2_000, Math.floor(interval * 1.25));
}

await browser.close();

const pass =
  !wrongSite &&
  snap?.exportPresent === true &&
  snap?.buildFlag === true &&
  snap?.runtimeFlag === true &&
  String(snap?.buildSha || "").startsWith(expectSha.slice(0, 7));

// Bundle scan is auxiliary only — never alone sufficient for PASS.
const bundleOnlyWouldPass = bundle.hitExpect === true && pass === false;

const failureClass = pass
  ? null
  : classifyFailure({
      wrongSite,
      snap,
      attempts,
      bundle,
      htmlMeta,
      budgetMs,
    });

// Legacy verifier sampled once after a fixed 1500ms sleep.
// If export attaches after that, the old probe false-negatives.
const oneShotWouldFail =
  firstExportAtMs == null ||
  firstExportAtMs > 1500 ||
  firstExpectShaAtMs == null ||
  firstExpectShaAtMs > 1500;

const report = {
  pass,
  expectSha,
  base,
  budgetMs,
  pollMs,
  failureClass,
  snap,
  attempts,
  firstExportAtMs,
  firstExpectShaAtMs,
  elapsedMs: Date.now() - startedAt,
  htmlMeta: {
    status: htmlMeta?.status ?? null,
    headers: htmlMeta?.headers ?? null,
    scriptCount: htmlMeta?.scriptCount ?? 0,
    htmlHasExpect: htmlMeta?.htmlHasExpect ?? false,
    htmlHasDd28351: htmlMeta?.htmlHasDd28351 ?? false,
    error: htmlMeta?.error ?? null,
  },
  bundleAuxiliary: {
    ...bundle,
    aloneInsufficient: true,
    bundleOnlyWouldPass,
  },
  diagnostics: {
    serviceWorkers: "block",
    cacheBuster: true,
    siteHostOk: isProdHost(base) ? new URL(base).hostname === siteHost : true,
    wrongSite,
    oneShot1500WouldFail: oneShotWouldFail,
    note:
      "PASS requires exportPresent+flags+buildSha match. Bundle scan never alone PASS.",
  },
};

if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(pass ? 0 : 1);
