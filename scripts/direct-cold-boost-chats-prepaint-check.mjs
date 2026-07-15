/**
 * Direct cold /boost and /chats must not arm prepaint markers.
 * Each path uses a fresh browser context (no cross-path session pollution).
 * Usage: node scripts/direct-cold-boost-chats-prepaint-check.mjs --base http://127.0.0.1:3010 [--repeat 10]
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : "http://127.0.0.1:3010";
const repeatIdx = args.indexOf("--repeat");
const repeat = Math.max(
  1,
  Number(repeatIdx >= 0 ? args[repeatIdx + 1] : "1") || 1,
);

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv";

const browser = await chromium
  .launch({ headless: true, channel: "chrome" })
  .catch(() => chromium.launch({ headless: true }));

async function sample(pathname) {
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
    } catch {
      /* ignore */
    }
  });
  const page = await ctx.newPage();
  await page.goto(`${base}${pathname}?_bd=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(900);
  const snap = await page.evaluate(() => {
    let boostMarkerParsed = null;
    const boostMarker = sessionStorage.getItem("sayittome:boost-prepaint-handoff");
    try {
      boostMarkerParsed = boostMarker ? JSON.parse(boostMarker) : null;
    } catch {
      boostMarkerParsed = null;
    }
    return {
      path: location.pathname,
      prepaintBoost: document.documentElement.getAttribute(
        "data-prepaint-boost-handoff-suppress",
      ),
      boostSuppress: document.documentElement.getAttribute(
        "data-boost-handoff-suppress",
      ),
      boostMarker,
      boostMarkerFrom: boostMarkerParsed?.from ?? null,
      boostMarkerTxId: boostMarkerParsed?.txId ?? null,
      suppressUntil: sessionStorage.getItem(
        "sayittome:boost-sequence-handoff-suppress-until",
      ),
      suppressTx: sessionStorage.getItem(
        "sayittome:boost-sequence-handoff-suppress-tx",
      ),
      prepaintChats: document.documentElement.getAttribute(
        "data-prepaint-chats-handoff-suppress",
      ),
      chatsMarker: sessionStorage.getItem("sayittome:chats-prepaint-handoff"),
      navCaptureSource:
        document.documentElement.dataset.sayittomeMainTabHandoffSource || null,
      loadingVisible: /Cargando\.\.\./.test(document.body?.innerText || ""),
    };
  });
  await ctx.close();
  return snap;
}

const results = { "/boost": [], "/chats": [] };
for (let i = 0; i < repeat; i++) {
  results["/boost"].push(await sample("/boost"));
  results["/chats"].push(await sample("/chats"));
}

await browser.close();

function boostColdOk(r) {
  return (
    r.prepaintBoost !== "1" &&
    r.boostSuppress !== "1" &&
    r.boostMarker == null &&
    r.boostMarkerFrom == null &&
    r.boostMarkerTxId == null &&
    r.boostMarkerFrom !== "/shuffle" &&
    !r.suppressTx
  );
}

function chatsColdOk(r) {
  return r.prepaintChats !== "1" && r.chatsMarker == null;
}

const boostPass = results["/boost"].every(boostColdOk);
const chatsPass = results["/chats"].every(chatsColdOk);
const pass = boostPass && chatsPass;

const out = {
  pass,
  repeat,
  boostPass,
  chatsPass,
  loadingAllowedOnBoost: results["/boost"].some((r) => r.loadingVisible),
  results: {
    "/boost": results["/boost"][0],
    "/chats": results["/chats"][0],
  },
  failBoostCount: results["/boost"].filter((r) => !boostColdOk(r)).length,
  failChatsCount: results["/chats"].filter((r) => !chatsColdOk(r)).length,
};
console.log(JSON.stringify(out, null, 2));
process.exit(pass ? 0 : 1);
