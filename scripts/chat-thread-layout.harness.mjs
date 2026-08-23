/**
 * CHAT_THREAD_LAYOUT
 * Reproduces the Chrome mobile capture: tall intro sibling pushes composer
 * below a reduced visualViewport. Productive layout module must keep header
 * + composer inside the visible box and the intro inside the scroller.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const menuSrc = fs.readFileSync(
  path.join(root, "src/components/chat/ProfileAnonChat.tsx"),
  "utf8",
);
const cssSrc = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const legacySrc = fs.readFileSync(
  path.join(root, "src/app/chat/[chatId]/legacy-chat.tsx"),
  "utf8",
);

assert.match(menuSrc, /resolveAnonChatThreadIntro/);
assert.match(menuSrc, /CHAT_THREAD_SCROLLER_CLASS/);
assert.match(menuSrc, /CHAT_THREAD_COMPOSER_CLASS/);
assert.match(menuSrc, /data-chat-thread-intro/);
assert.match(menuSrc, /data-chat-thread-scroller/);
assert.match(menuSrc, /shouldAutoscrollChatThread/);
assert.doesNotMatch(
  menuSrc,
  /isClassic && !isOwnerViewing && !surfaceEngaged \? \s*\n\s*<div className="shrink-0">/,
);
assert.match(cssSrc, /\.sayittome-chat-thread-scroller/);
assert.match(cssSrc, /\.sayittome-chat-thread-composer/);
assert.match(legacySrc, /sayittome-chat-thread-scroller/);

const layout = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatThreadLayout.ts")).href
);
const composer = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatComposerViewport.ts")).href
);

const intro = layout.resolveAnonChatThreadIntro({
  isClassic: true,
  isOwnerViewing: false,
  surfaceEngaged: false,
  authReady: true,
});
assert.equal(intro.showClassicIntro, true);
assert.equal(intro.introInScroller, true);
assert.equal(
  layout.shouldAutoscrollChatThread({ stickToBottom: true, showIntro: true }),
  false,
);
assert.equal(
  layout.shouldAutoscrollChatThread({ stickToBottom: true, showIntro: false }),
  true,
);

const VIEWPORTS = [
  { width: 360, height: 640, chromeTop: 56, chromeBottom: 48 },
  { width: 412, height: 732, chromeTop: 56, chromeBottom: 52 },
];

function shellPage(viewport, innerHtml, inset) {
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <style>
    :root {
      --sayittome-chat-vvh: ${inset.shellHeight}px;
      --sayittome-chat-vv-offset-top: ${inset.shellOffsetTop}px;
      --sayittome-chat-composer-pad: ${inset.composerPadPx}px;
    }
    html, body { margin:0; padding:0; background:#000; color:#fff; }
    .sayittome-chat-shell {
      position: fixed;
      left: 0;
      right: 0;
      top: var(--sayittome-chat-vv-offset-top, 0px);
      height: var(--sayittome-chat-vvh, 100dvh);
      max-height: var(--sayittome-chat-vvh, 100dvh);
      width: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: #000;
    }
    ${layout.CHAT_THREAD_LAYOUT_CSS}
    .sayittome-chat-composer {
      flex-shrink: 0;
      padding-bottom: max(var(--sayittome-chat-composer-pad, 12px), 0px);
    }
  </style>
</head>
<body>
  <main class="sayittome-chat-shell">
    <section class="${layout.CHAT_THREAD_COLUMN_CLASS}">${innerHtml}</section>
  </main>
</body>
</html>`;
}

function inspectThread() {
  function box(el) {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
    };
  }
  const header = document.querySelector("[data-chat-thread-header]");
  const composerEl = document.querySelector("[data-chat-thread-composer]");
  const scroller = document.querySelector("[data-chat-thread-scroller]");
  const intro = document.querySelector("[data-chat-thread-intro]");
  const vv = window.visualViewport;
  return {
    viewport: {
      top: vv?.offsetTop ?? 0,
      bottom: (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight),
      width: vv?.width ?? window.innerWidth,
      height: vv?.height ?? window.innerHeight,
    },
    header: box(header),
    composer: box(composerEl),
    scroller: box(scroller),
    intro: box(intro),
    introInsideScroller: Boolean(scroller && intro && scroller.contains(intro)),
    scrollerScrollHeight: scroller?.scrollHeight ?? 0,
    scrollerClientHeight: scroller?.clientHeight ?? 0,
  };
}

const browser = await chromium.launch({ headless: true });
const report = [];

try {
  for (const viewport of VIEWPORTS) {
    const vvHeight = viewport.height - viewport.chromeTop - viewport.chromeBottom;
    const inset = composer.computeChatComposerViewport({
      innerHeight: viewport.height,
      visualViewport: { height: vvHeight, offsetTop: viewport.chromeTop },
      safeAreaBottom: 34,
      isNativeShell: false,
    });

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(
      ({ height, offsetTop, width }) => {
        Object.defineProperty(window, "visualViewport", {
          configurable: true,
          get() {
            return {
              height,
              width,
              offsetTop,
              offsetLeft: 0,
              addEventListener() {},
              removeEventListener() {},
            };
          },
        });
      },
      { height: vvHeight, offsetTop: viewport.chromeTop, width: viewport.width },
    );

    for (const mode of ["classic", "modern"]) {
      const publishedHtml = layout.buildAnonChatThreadInnerHtml({
        variant: "published",
        mode,
      });
      await page.setContent(shellPage(viewport, publishedHtml, inset), {
        waitUntil: "domcontentloaded",
      });
      const published = await page.evaluate(inspectThread);
      assert.equal(
        layout.isPublishedComposerPushedOut({
          viewportBottom: published.viewport.bottom,
          composer: published.composer,
        }),
        true,
        `${viewport.width}x${viewport.height} ${mode} published must push composer out`,
      );
      assert.equal(published.introInsideScroller, false);

      const currentHtml = layout.buildAnonChatThreadInnerHtml({
        variant: "current",
        mode,
      });
      await page.setContent(shellPage(viewport, currentHtml, inset), {
        waitUntil: "domcontentloaded",
      });
      const current = await page.evaluate(inspectThread);
      const judged = layout.evaluateChatThreadLayout(current);
      assert.equal(
        judged.ok,
        true,
        `${viewport.width}x${viewport.height} ${mode} current failed: ${judged.reasons.join(",")}`,
      );
      assert.equal(current.introInsideScroller, true);
      assert.ok(current.composer.bottom <= current.viewport.bottom + 0.5);
      assert.ok(current.scroller.height > 8);
      assert.ok(
        current.scrollerScrollHeight >= current.scrollerClientHeight,
        "center must remain a scrollport",
      );

      const withMessages = layout.buildAnonChatThreadInnerHtml({
        variant: "current",
        mode,
        hasMessages: true,
      });
      await page.setContent(shellPage(viewport, withMessages, inset), {
        waitUntil: "domcontentloaded",
      });
      const messaged = await page.evaluate(inspectThread);
      const messagedJudge = layout.evaluateChatThreadLayout({
        ...messaged,
        intro: null,
        introInsideScroller: true,
      });
      assert.equal(
        messagedJudge.ok,
        true,
        `${viewport.width}x${viewport.height} ${mode} messages failed: ${messagedJudge.reasons.join(",")}`,
      );

      const keyboardInset = composer.computeChatComposerViewport({
        innerHeight: viewport.height,
        visualViewport: { height: Math.min(360, vvHeight), offsetTop: viewport.chromeTop },
        safeAreaBottom: 34,
        isNativeShell: false,
      });
      await page.addInitScript(
        ({ height, offsetTop, width }) => {
          Object.defineProperty(window, "visualViewport", {
            configurable: true,
            get() {
              return {
                height,
                width,
                offsetTop,
                offsetLeft: 0,
                addEventListener() {},
                removeEventListener() {},
              };
            },
          });
        },
        {
          height: keyboardInset.shellHeight,
          offsetTop: keyboardInset.shellOffsetTop,
          width: viewport.width,
        },
      );
      await page.setContent(shellPage(viewport, currentHtml, keyboardInset), {
        waitUntil: "domcontentloaded",
      });
      const keyed = await page.evaluate(inspectThread);
      const keyedJudge = layout.evaluateChatThreadLayout(keyed);
      assert.equal(
        keyedJudge.ok,
        true,
        `${viewport.width}x${viewport.height} ${mode} keyboard failed: ${keyedJudge.reasons.join(",")}`,
      );

      const nativeInset = composer.computeChatComposerViewport({
        innerHeight: viewport.height,
        visualViewport: { height: vvHeight, offsetTop: viewport.chromeTop },
        safeAreaBottom: 34,
        isNativeShell: true,
      });
      await page.setContent(shellPage(viewport, currentHtml, nativeInset), {
        waitUntil: "domcontentloaded",
      });
      const native = await page.evaluate(inspectThread);
      const nativeJudge = layout.evaluateChatThreadLayout(native);
      assert.equal(
        nativeJudge.ok,
        true,
        `${viewport.width}x${viewport.height} ${mode} native failed: ${nativeJudge.reasons.join(",")}`,
      );

      report.push({
        viewport: `${viewport.width}x${viewport.height}`,
        mode,
        publishedPushed: true,
        currentOk: true,
      });
    }

    await context.close();
  }
} finally {
  await browser.close();
}

console.log(
  JSON.stringify(
    {
      gate: "CHAT_THREAD_LAYOUT",
      pass: true,
      viewports: VIEWPORTS.map((row) => `${row.width}x${row.height}`),
      publishedFails: true,
      samples: report.length,
    },
    null,
    2,
  ),
);
