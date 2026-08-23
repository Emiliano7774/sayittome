/**
 * CLAIM_HISTORY_MODAL_SCROLL
 * Product layout + real DOM: published 88dvh/no-nav fails; reserved sheet scrolls.
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
  path.join(root, "src/components/profile/ProfileClaimHistoryMenu.tsx"),
  "utf8",
);
const layoutSrc = fs.readFileSync(
  path.join(root, "src/lib/overlay/claimHistoryModalLayout.ts"),
  "utf8",
);

assert.match(menuSrc, /createPortal/);
assert.match(menuSrc, /resolveClaimHistoryModalPortalRoot/);
assert.match(menuSrc, /getClaimHistoryScrollStyle/);
assert.match(menuSrc, /getClaimHistorySheetStyle/);
assert.match(menuSrc, /data-claim-history-scroll|CLAIM_HISTORY_SCROLL_ATTR/);
assert.doesNotMatch(menuSrc, /preventDefault/);
assert.doesNotMatch(layoutSrc, /preventDefault/);
assert.doesNotMatch(menuSrc, /max-h-\[min\(88dvh,760px\)\]/);

const layout = await import(
  pathToFileURL(path.join(root, "src/lib/overlay/claimHistoryModalLayout.ts")).href
);

assert.deepEqual(layout.claimHistoryModalSlots()[0], "header");
assert.equal(layout.getClaimHistoryScrollStyle().touchAction, "pan-y");
assert.equal(layout.getClaimHistoryScrollStyle().minHeight, 0);
assert.equal(layout.getClaimHistoryScrollStyle().overflowY, "auto");
assert.equal(layout.getClaimHistorySheetStyle().minHeight, 0);
assert.equal(layout.getClaimHistoryOverlayStyle().overflow, "hidden");

const compact = layout.resolveClaimHistorySheetMaxHeightPx({
  innerHeight: 640,
  visualViewportHeight: 640,
  bottomUiPx: 108,
  safeTopPx: 0,
});
const published = layout.resolvePublishedClaimHistorySheetMaxHeightPx(640);
assert.ok(published > 640 - 108, "published 88dvh must overflow the nav hole");
assert.ok(compact <= 640 - 108, "reserved height must sit above the nav");

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 412, height: 732 },
  { width: 732, height: 412 },
];
const NAV_HEIGHT = 108;
const LONG =
  "Mensaje largo de reclamo.\n".repeat(18) +
  "Fin del reclamo antiguo.";
const REPLY = "Respuesta de administración.\n".repeat(10) + "Cierre de la respuesta.";

function longArticles() {
  return Array.from({ length: 6 }, (_, index) => {
    const last = index === 5;
    return `<article data-claim-article="${index}" ${last ? 'data-claim-oldest="1"' : ""} style="
      padding:16px;margin:0 0 12px;border:1px solid rgba(255,255,255,.12);border-radius:16px;
    ">
      <p style="white-space:pre-wrap;font-size:14px;line-height:1.45">${LONG} #${index + 1}</p>
      ${
        last
          ? `<div data-claim-oldest-reply="1" style="margin-top:12px;padding:12px;border:1px solid rgba(16,185,129,.3)">
              <p style="white-space:pre-wrap;font-size:14px">${REPLY}</p>
            </div>`
          : ""
      }
    </article>`;
  }).join("");
}

function publishedHtml(viewport) {
  return `<!doctype html>
<html class="sayittome-native-shell">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <style>
    html, body { margin:0; padding:0; background:#000; color:#fff; overflow:hidden; height:100%; }
    .profile { position:relative; overflow:hidden; transform:translateX(0); height:${viewport.height}px; }
    .nav { position:fixed; left:0; right:0; bottom:0; height:${NAV_HEIGHT}px; z-index:9999; background:#171717; }
  </style>
</head>
<body class="sayittome-native-shell sayittome-has-bottom-nav" style="width:${viewport.width}px;height:${viewport.height}px">
  <div class="profile">
    <div data-claim-history-layer="1" style="
      position:fixed;inset:0;display:flex;align-items:flex-end;justify-content:center;
      padding:12px;padding-bottom:max(1rem, env(safe-area-inset-bottom));
      background:rgba(0,0,0,.85);
    ">
      <section data-claim-history-sheet="1" style="
        display:flex;flex-direction:column;width:100%;max-width:36rem;
        max-height:88dvh;overflow:hidden;background:#09090b;border-radius:24px;
      ">
        <header data-claim-history-header="1" style="flex-shrink:0;padding:16px 20px;border-bottom:1px solid #222">Historial</header>
        <div data-claim-history-scroll="1" style="overflow-y:auto;padding:16px">
          ${longArticles()}
        </div>
      </section>
    </div>
  </div>
  <nav class="nav" data-bottom-nav="1"></nav>
</body>
</html>`;
}

function fixedHtml(viewport) {
  const overlay = layout.styleRecordToCss(layout.getClaimHistoryOverlayStyle());
  const sheet = layout.styleRecordToCss(layout.getClaimHistorySheetStyle());
  const header = layout.styleRecordToCss(layout.getClaimHistoryHeaderStyle());
  const scroll = layout.styleRecordToCss(layout.getClaimHistoryScrollStyle());
  return `<!doctype html>
<html class="sayittome-native-shell">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <style>
    :root { --sayittome-bottom-ui: ${NAV_HEIGHT}px; --sayittome-nav-height: 74px; }
    html, body { margin:0; padding:0; background:#000; color:#fff; height:100%; overflow:hidden; }
    .nav { position:fixed; left:0; right:0; bottom:0; height:${NAV_HEIGHT}px; z-index:9999; background:#171717; }
  </style>
</head>
<body class="sayittome-native-shell sayittome-has-bottom-nav" style="width:${viewport.width}px;height:${viewport.height}px">
  <div data-claim-history-layer="1" style="${overlay};background:rgba(0,0,0,.85)">
    <section data-claim-history-sheet="1" style="${sheet};background:#09090b;border-radius:24px">
      <header data-claim-history-header="1" data-claim-history-close="1" style="${header};padding:16px 20px;border-bottom:1px solid #222">
        Historial de reclamos
      </header>
      <div data-claim-history-scroll="1" style="${scroll};padding:16px">
        ${longArticles()}
      </div>
    </section>
  </div>
  <nav class="nav" data-bottom-nav="1"></nav>
</body>
</html>`;
}

function inspect(kind) {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const sheet = document.querySelector("[data-claim-history-sheet='1']");
  const header = document.querySelector("[data-claim-history-header='1']");
  const scroller = document.querySelector("[data-claim-history-scroll='1']");
  const oldest = document.querySelector("[data-claim-oldest='1']");
  const reply = document.querySelector("[data-claim-oldest-reply='1']");
  const nav = document.querySelector("[data-bottom-nav='1']");
  const reasons = [];

  function box(el) {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
  }

  const sheetBox = box(sheet);
  const headerBox = box(header);
  const navBox = box(nav);
  const replyBox = box(reply);

  if (!sheetBox || !headerBox || !navBox || !scroller || !oldest || !reply) {
    return { ok: false, reasons: ["missing-nodes"], kind };
  }

  const style = getComputedStyle(scroller);
  if (kind === "fixed") {
    if (style.touchAction !== "pan-y" && style.touchAction !== "pan-y pinch-zoom") {
      reasons.push("missing-pan-y");
    }
    if (style.minHeight !== "0px") reasons.push("missing-min-height-0");
    if (style.overflowY !== "auto" && style.overflowY !== "scroll") reasons.push("scroller-not-auto");
    if (sheetBox.bottom > navBox.top + 0.5) reasons.push("sheet-under-nav");
    if (headerBox.top < -0.5) reasons.push("header-clipped");
    if (scroller.scrollHeight <= scroller.clientHeight + 1) reasons.push("no-overflow");
    scroller.scrollTop = scroller.scrollHeight;
    const after = reply.getBoundingClientRect();
    if (after.bottom > navBox.top + 0.5) reasons.push("oldest-reply-under-nav");
    if (after.bottom > viewport.height + 0.5) reasons.push("oldest-reply-below-viewport");
    if (after.bottom < headerBox.bottom + 8) reasons.push("oldest-reply-not-reached");
  } else {
    const covered = replyBox.bottom > navBox.top + 0.5 || sheetBox.bottom > navBox.top + 8;
    const noScroll = scroller.scrollHeight <= scroller.clientHeight + 1;
    if (!covered && !noScroll) reasons.push("published-did-not-fail");
    else reasons.push(covered ? "published-under-nav" : "published-no-scroll");
    return { ok: false, reasons, kind };
  }

  return { ok: reasons.length === 0, reasons, kind };
}

const browser = await chromium.launch({ headless: true });
const report = [];

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.setViewportSize(viewport);

    await page.setContent(publishedHtml(viewport), { waitUntil: "domcontentloaded" });
    const broken = await page.evaluate(inspect, "published");
    assert.equal(broken.ok, false, `${viewport.width}x${viewport.height} published must fail`);

    await page.setContent(fixedHtml(viewport), { waitUntil: "domcontentloaded" });
    const fixed = await page.evaluate(inspect, "fixed");
    assert.equal(
      fixed.ok,
      true,
      `${viewport.width}x${viewport.height} fixed failed: ${fixed.reasons.join(",")}`,
    );

    report.push({
      viewport: `${viewport.width}x${viewport.height}`,
      publishedReasons: broken.reasons,
      fixed,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(
  JSON.stringify(
    {
      gate: "CLAIM_HISTORY_MODAL_SCROLL",
      pass: true,
      viewports: VIEWPORTS.map((row) => `${row.width}x${row.height}`),
      publishedFails: true,
      reservedOk: true,
    },
    null,
    2,
  ),
);
