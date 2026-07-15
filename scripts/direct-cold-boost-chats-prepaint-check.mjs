/**
 * Direct cold /boost and /chats must not arm prepaint markers.
 * Usage: node scripts/direct-cold-boost-chats-prepaint-check.mjs --base http://127.0.0.1:3010
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : "http://127.0.0.1:3010";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 SayItToMeApp/wv",
});
const page = await ctx.newPage();
const results = {};

for (const path of ["/boost", "/chats"]) {
  await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);
  results[path] = await page.evaluate(() => ({
    path: location.pathname,
    prepaintBoost: document.documentElement.getAttribute(
      "data-prepaint-boost-handoff-suppress",
    ),
    boostSuppress: document.documentElement.getAttribute(
      "data-boost-handoff-suppress",
    ),
    boostMarker: sessionStorage.getItem("sayittome:boost-prepaint-handoff"),
    prepaintChats: document.documentElement.getAttribute(
      "data-prepaint-chats-handoff-suppress",
    ),
    chatsMarker: sessionStorage.getItem("sayittome:chats-prepaint-handoff"),
  }));
}

await browser.close();

const pass =
  results["/boost"].prepaintBoost !== "1" &&
  results["/boost"].boostMarker == null &&
  results["/boost"].boostSuppress !== "1" &&
  results["/chats"].prepaintChats !== "1" &&
  results["/chats"].chatsMarker == null;

const out = { pass, results };
console.log(JSON.stringify(out, null, 2));
process.exit(pass ? 0 : 1);
