#!/usr/bin/env node
/**
 * Local Playwright counter for Firebase Storage media requests during warm tab hops.
 * Requires a local or remote base URL. Does not mutate production.
 *
 *   BASE_URL=http://localhost:3000 node scripts/media-request-counter.harness.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const storageHits = [];
page.on("request", (req) => {
  const url = req.url();
  if (
    url.includes("firebasestorage.googleapis.com") ||
    url.includes(".firebasestorage.app") ||
    url.includes("storage.googleapis.com")
  ) {
    storageHits.push({
      url: url.slice(0, 160),
      resourceType: req.resourceType(),
      method: req.method(),
    });
  }
});

try {
  await page.goto(`${BASE}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const afterShuffle = storageHits.length;

  await page.goto(`${BASE}/stories`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const afterStories = storageHits.length;

  await page.goto(`${BASE}/chats`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/shuffle`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  const afterWarmHop = storageHits.length;

  const unique = new Set(storageHits.map((h) => h.url)).size;
  const summary = {
    ok: true,
    base: BASE,
    afterShuffle,
    afterStories,
    afterWarmHop,
    uniqueUrls: unique,
    sample: storageHits.slice(0, 12),
    note: "Anonymous cold sessions may show low counts; use authenticated local sessions for richer media flows.",
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
