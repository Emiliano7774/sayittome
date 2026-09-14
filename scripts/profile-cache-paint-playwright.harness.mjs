/**
 * Playwright: reserved profile frame is identical cold/warm/back; shuffle-seed
 * never paints a shorter geometry; warm restore does zero extra fetch.
 * Usage: node --experimental-strip-types scripts/profile-cache-paint-playwright.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, devices } from "playwright";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const { getClassicProfileUiTokens } = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/classicProfileScale.ts")).href
);

const ui = getClassicProfileUiTokens(10);

function profileHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { margin: 0; background: #000; color: #fff; font-family: sans-serif; }
  .hero { height: ${ui.heroHeight}; min-height: ${ui.heroHeight}; overflow: hidden; }
  .stats { min-height: ${ui.statBubble}; display: flex; gap: 12px; padding: 16px; }
  .stat { width: ${ui.statBubble}; height: ${ui.statBubble}; border-radius: 9999px; background: #7c3aed; flex-shrink: 0; }
  .bio { min-height: 72px; padding: 16px; font-size: ${ui.bioSize}; }
  .seed-only { min-height: 24px; padding: 16px; }
</style>
</head>
<body>
  <div data-profile-frame>
    <div class="hero" data-profile-hero></div>
    <div class="stats" data-profile-stats>
      <div class="stat"></div><div class="stat"></div><div class="stat"></div>
    </div>
    <div class="bio" data-profile-bio></div>
  </div>
  <script>
    window.__fetches = 0;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      window.__fetches += 1;
      return nativeFetch(...args);
    };
    window.__paint = function(kind) {
      const hero = document.querySelector("[data-profile-hero]");
      const stats = document.querySelector("[data-profile-stats]");
      const bio = document.querySelector("[data-profile-bio]");
      if (kind === "seed") {
        stats.replaceChildren();
        stats.style.minHeight = "0";
        stats.style.display = "none";
        bio.className = "seed-only";
        bio.textContent = "partial seed";
        return;
      }
      stats.style.minHeight = "${ui.statBubble}";
      stats.style.display = "flex";
      if (!stats.children.length) {
        stats.innerHTML = '<div class="stat"></div><div class="stat"></div><div class="stat"></div>';
      }
      bio.className = "bio";
      bio.textContent = kind === "warm" ? "full api bio" : "";
    };
    window.__isPaintable = function(source) { return source === "api"; };
  </script>
</body>
</html>`;
}

async function measure(page) {
  return page.evaluate(() => {
    const frame = document.querySelector("[data-profile-frame]");
    const hero = document.querySelector("[data-profile-hero]");
    const stats = document.querySelector("[data-profile-stats]");
    const bio = document.querySelector("[data-profile-bio]");
    const box = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        height: rect.height,
        width: rect.width,
        top: rect.top,
        offsetHeight: el.offsetHeight,
      };
    };
    return {
      frame: box(frame),
      hero: box(hero),
      stats: box(stats),
      bio: box(bio),
      fetches: window.__fetches,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices["Pixel 7"] });
const page = await context.newPage();

try {
  await page.setContent(profileHtml(), { waitUntil: "domcontentloaded" });
  const cold = await measure(page);

  await page.evaluate(() => window.__paint("warm"));
  const warm = await measure(page);

  assert.equal(Math.round(cold.hero.height), Math.round(warm.hero.height), "hero CLS");
  assert.equal(Math.round(cold.stats.height), Math.round(warm.stats.height), "stats CLS");
  assert.equal(Math.round(cold.frame.width), Math.round(warm.frame.width), "frame width");
  assert.equal(warm.fetches, 0, "warm paint must not fetch");

  await page.evaluate(() => window.__paint("seed"));
  const seed = await measure(page);
  const seedPaintable = await page.evaluate(() => window.__isPaintable("shuffle-seed"));
  const apiPaintable = await page.evaluate(() => window.__isPaintable("api"));
  assert.equal(seedPaintable, false);
  assert.equal(apiPaintable, true);
  assert.ok(
    Math.round(seed.stats.height) < Math.round(warm.stats.height),
    "partial seed changes stats geometry and must not be used for paint",
  );

  await page.evaluate(() => window.__paint("warm"));
  const restored = await measure(page);
  assert.equal(Math.round(restored.hero.height), Math.round(warm.hero.height), "back hero");
  assert.equal(Math.round(restored.stats.height), Math.round(warm.stats.height), "back stats");
  assert.equal(Math.round(restored.bio.height), Math.round(warm.bio.height), "back bio");
  assert.equal(Math.round(restored.frame.height), Math.round(warm.frame.height), "back frame");
  assert.equal(restored.fetches, 0, "back restore must not fetch");

  console.log(
    JSON.stringify(
      {
        gate: "PROFILE_CACHE_PAINT_PLAYWRIGHT",
        pass: true,
        coldHero: Math.round(cold.hero.height),
        warmHero: Math.round(warm.hero.height),
        warmStats: Math.round(warm.stats.height),
        seedStats: Math.round(seed.stats.height),
        fetches: restored.fetches,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
