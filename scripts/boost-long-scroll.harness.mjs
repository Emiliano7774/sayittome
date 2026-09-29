/**
 * BOOST_LONG_SCROLL
 * A settled Boost keep-alive panel must contribute its full height to the
 * document. During an active handoff it may remain a fixed viewport cover.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

assert.match(css, /BOOST_LONG_SCROLL/);
assert.match(
  css,
  /data-sayittome-route-kind="main-tab"[^}]+data-sayittome-bar-target="boost"[^}]+#sayittome-main-tab-keepalive-boost\.sayittome-main-tab-keepalive-visible\s*\{[^}]*position:\s*relative\s*!important/s,
);

const systemChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({
  headless: true,
  ...(fs.existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  await page.setContent(`<!doctype html>
    <html data-sayittome-route-kind="main-tab" data-sayittome-bar-target="boost">
      <head><style>${css}</style></head>
      <body class="sayittome-boost-route sayittome-has-bottom-nav">
        <div id="sayittome-main-tab-keepalive-boost" class="sayittome-main-tab-keepalive-visible">
          <main data-scroll-root class="sayittome-boost-page">
            <div style="height:2400px"></div>
          </main>
        </div>
      </body>
    </html>`);

  const settled = await page.evaluate(() => {
    const host = document.getElementById("sayittome-main-tab-keepalive-boost");
    return {
      position: getComputedStyle(host).position,
      touchAction: getComputedStyle(host).touchAction,
      overflow: getComputedStyle(host).overflow,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });

  assert.equal(settled.position, "relative");
  assert.equal(settled.touchAction, "pan-y");
  assert.equal(settled.overflow, "visible");
  assert.ok(settled.scrollHeight > settled.viewportHeight * 2);

  await page.evaluate(() => window.scrollTo(0, 900));
  assert.ok((await page.evaluate(() => window.scrollY)) > 0);

  await page.evaluate(() =>
    document.documentElement.classList.add("sayittome-main-tab-handoff-pending"),
  );

  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.getElementById("sayittome-main-tab-keepalive-boost")).position,
    ),
    "fixed",
  );

  console.log(JSON.stringify({ gate: "BOOST_LONG_SCROLL", pass: true }, null, 2));
} finally {
  await browser.close();
}
