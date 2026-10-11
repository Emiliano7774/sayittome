/**
 * CHAT_INBOX_LONG_SCROLL
 * A settled Chats keep-alive panel must contribute its full height to the
 * document. During an active handoff it may remain a fixed viewport cover.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

assert.match(css, /CHAT_INBOX_LONG_SCROLL|long inbox is clipped to one viewport/);
assert.match(
  css,
  /data-sayittome-route-kind="main-tab"[^}]+data-sayittome-bar-target="chats"[^}]+#sayittome-main-tab-keepalive-chats\.sayittome-main-tab-keepalive-visible\s*\{[^}]*position:\s*relative\s*!important/s,
);

const systemChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({
  headless: true,
  ...(fs.existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  await page.setContent(`<!doctype html>
    <html data-sayittome-route-kind="main-tab" data-sayittome-bar-target="chats">
      <head><style>${css}</style></head>
      <body class="sayittome-has-bottom-nav">
        <div id="sayittome-main-tab-keepalive-chats" class="sayittome-main-tab-keepalive-visible">
          <main data-nav-primary-content data-chats-inbox-scroll-root>
            <div data-nav-chats-primary style="height:2400px"></div>
          </main>
        </div>
        <nav class="sayittome-bottom-nav" style="position:fixed;left:0;right:0;bottom:0;height:74px"></nav>
      </body>
    </html>`);

  const settled = await page.evaluate(() => {
    const host = document.getElementById("sayittome-main-tab-keepalive-chats");
    return {
      position: getComputedStyle(host).position,
      touchAction: getComputedStyle(host).touchAction,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });
  assert.equal(settled.position, "relative");
  assert.equal(settled.touchAction, "pan-y");
  assert.ok(settled.scrollHeight > settled.viewportHeight * 2);

  await page.evaluate(() => window.scrollTo(0, 900));
  assert.ok((await page.evaluate(() => window.scrollY)) > 0);

  // Regression: the last chat must be wholly ABOVE the fixed bottom navigation.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const bottom = await page.evaluate(() => ({
    lastRowBottom: document.querySelector("[data-nav-chats-primary]").getBoundingClientRect().bottom,
    fixedNavTop: document.querySelector(".sayittome-bottom-nav").getBoundingClientRect().top,
    scrollY: window.scrollY,
  }));
  assert.ok(bottom.scrollY > 900, "long inbox must scroll to the actual end");
  assert.ok(bottom.lastRowBottom <= bottom.fixedNavTop - 16,
    `last row must clear fixed navbar: ${JSON.stringify(bottom)}`);

  await page.evaluate(() =>
    document.documentElement.classList.add("sayittome-main-tab-handoff-pending"),
  );
  assert.equal(
    await page.evaluate(() =>
      getComputedStyle(document.getElementById("sayittome-main-tab-keepalive-chats")).position,
    ),
    "fixed",
  );

  console.log(JSON.stringify({ gate: "CHAT_INBOX_LONG_SCROLL", pass: true }, null, 2));
} finally {
  await browser.close();
}
