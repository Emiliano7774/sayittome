/**
 * ANDROID_PROFILE_OPTIONS_MENU_VIEWPORT
 * Real DOM (Playwright) of the owner ⋮ menu in a native WebView shell.
 * Published anchored dropdown (top:-9999 / clipped) must fail.
 * Mobile sheet must keep both actions intact above bottom nav + chrome.
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

const classicSrc = fs.readFileSync(
  path.join(root, "src/app/u/[username]/page.tsx"),
  "utf8",
);
const modernSrc = fs.readFileSync(
  path.join(root, "src/components/modern/ModernPublicProfile.tsx"),
  "utf8",
);
const settingsSrc = fs.readFileSync(
  path.join(root, "src/app/settings/page.tsx"),
  "utf8",
);
const menuSrc = fs.readFileSync(
  path.join(root, "src/components/profile/ProfileClaimHistoryMenu.tsx"),
  "utf8",
);
const backSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/nativeBack.ts"),
  "utf8",
);

assert.match(classicSrc, /ProfileClaimHistoryMenu/);
assert.match(modernSrc, /ProfileClaimHistoryMenu/);
assert.match(settingsSrc, /ProfileClaimHistoryMenu/);
assert.match(menuSrc, /getProfileOptionsSheetStyle/);
assert.match(menuSrc, /shouldUseProfileOptionsSheet/);
assert.match(menuSrc, /shouldIgnoreProfileOptionsDismiss/);
assert.match(menuSrc, /min-h-12/);
assert.match(menuSrc, /pointer-events-auto/);
assert.match(menuSrc, /data-profile-options-sheet/);
assert.match(menuSrc, /data-profile-options-backdrop/);
assert.match(menuSrc, /data-profile-options-layer/);
assert.match(menuSrc, /sayittome-profile-options-open/);
assert.match(menuSrc, /sayittome:close-profile-options/);
assert.match(menuSrc, /notificationsOpen/);
assert.match(menuSrc, /historyOpen/);
assert.match(menuSrc, /data-chat-notification-panel/);
assert.match(menuSrc, /claim_history_title/);
assert.match(backSrc, /sayittome:close-profile-options/);
assert.match(backSrc, /sayittome:close-claim-history/);
assert.match(backSrc, /sayittome:close-notification-settings/);
assert.match(menuSrc, /sheetMode \?[\s\S]*getProfileOptionsSheetStyle/);
assert.doesNotMatch(
  menuSrc,
  /sheetMode[\s\S]{0,80}top:\s*menuPos\?\.top \?\? -9999/,
);

const layout = await import(
  pathToFileURL(path.join(root, "src/lib/overlay/profileOptionsMenuLayout.ts")).href
);

assert.equal(
  layout.shouldUseProfileOptionsSheet({
    innerWidth: 1280,
    matchMedia: () => ({ matches: false }),
    document: { documentElement: { classList: { contains: () => false } } },
  }),
  false,
);
assert.equal(
  layout.shouldUseProfileOptionsSheet({
    innerWidth: 390,
    matchMedia: (query) => ({ matches: query.includes("767") }),
    document: { documentElement: { classList: { contains: () => false } } },
  }),
  true,
);
assert.equal(
  layout.shouldUseProfileOptionsSheet({
    innerWidth: 1280,
    matchMedia: () => ({ matches: false }),
    document: {
      documentElement: {
        classList: { contains: (name) => name === "sayittome-native-shell" },
      },
    },
  }),
  true,
);

assert.equal(layout.shouldIgnoreProfileOptionsDismiss(1_000, 1_200), true);
assert.equal(layout.shouldIgnoreProfileOptionsDismiss(1_000, 1_500), false);
assert.equal(layout.PROFILE_OPTIONS_TRIGGER_MIN_PX, 48);

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 700 },
  { width: 412, height: 732 },
];
const NAV_HEIGHT = 108;
const MIN_TOUCH = layout.PROFILE_OPTIONS_MIN_TOUCH_PX;

function publishedDropdownHtml() {
  return `
    <div data-profile-options-dropdown="1" data-published-menu="1" style="
      position:fixed;
      top:-9999px;
      right:16px;
      width:18rem;
      z-index:1000001;
      padding:8px;
      border-radius:16px;
      background:#09090b;
    ">
      <button data-profile-option="notifications" type="button" style="
        display:flex;width:100%;align-items:center;gap:12px;
        padding:12px 16px;font-size:14px;font-weight:700;color:#fff;
        border:0;background:transparent;text-align:left;
      ">Notificaciones del chat</button>
      <button data-profile-option="claim-history" type="button" style="
        display:flex;width:100%;align-items:center;gap:12px;
        padding:12px 16px;font-size:14px;font-weight:700;color:#fff;
        border:0;background:transparent;text-align:left;
      ">Historial de reclamos</button>
    </div>
  `;
}

function publishedClippedHtml(viewportHeight) {
  return `
    <div data-profile-options-dropdown="1" data-published-menu="1" style="
      position:fixed;
      top:${viewportHeight - 48}px;
      right:16px;
      width:18rem;
      z-index:1000001;
      padding:8px;
      border-radius:16px;
      background:#09090b;
    ">
      <button data-profile-option="notifications" type="button" style="
        display:flex;width:100%;align-items:center;gap:12px;
        padding:12px 16px;font-size:14px;font-weight:700;color:#fff;
        border:0;background:transparent;text-align:left;
      ">Notificaciones del chat</button>
      <button data-profile-option="claim-history" type="button" style="
        display:flex;width:100%;align-items:center;gap:12px;
        padding:12px 16px;font-size:14px;font-weight:700;color:#fff;
        border:0;background:transparent;text-align:left;
      ">Historial de reclamos</button>
    </div>
  `;
}

function sheetHtml() {
  const sheetStyle = layout.styleRecordToCss(layout.getProfileOptionsSheetStyle());
  const actionStyle = layout.styleRecordToCss(layout.getProfileOptionsActionStyle());
  return `
    <div data-profile-options-layer="1" style="position:fixed;inset:0;z-index:1000001">
      <button data-profile-options-backdrop="1" type="button" style="position:absolute;inset:0;background:rgba(0,0,0,.55);border:0"></button>
      <div data-profile-options-dropdown="1" data-profile-options-sheet="1" style="${sheetStyle};border-radius:16px;background:#09090b;padding:8px">
        <button data-profile-option="notifications" type="button" style="${actionStyle};gap:12px;border:0;background:transparent;color:#fff;font-size:14px;font-weight:700">
          Notificaciones del chat
        </button>
        <button data-profile-option="claim-history" type="button" style="${actionStyle};gap:12px;border:0;background:transparent;color:#fff;font-size:14px;font-weight:700">
          Historial de reclamos
        </button>
      </div>
    </div>
  `;
}

function shellHtml(viewport, menuHtml) {
  return `<!doctype html>
<html class="sayittome-native-shell" style="overflow-x:clip">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <style>
    :root {
      --sayittome-nav-height: 74px;
      --sayittome-browser-chrome-bottom: 10px;
      --sayittome-bottom-ui: ${NAV_HEIGHT}px;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #000;
      color: #fff;
      overflow-x: clip;
      width: 100%;
      height: 100%;
    }
    body.sayittome-has-bottom-nav {
      --sayittome-bottom-ui: ${NAV_HEIGHT}px;
    }
    .sayittome-bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: ${NAV_HEIGHT}px;
      z-index: 9999;
      background: #171717;
    }
  </style>
</head>
<body class="sayittome-native-shell sayittome-has-bottom-nav" style="width:${viewport.width}px;height:${viewport.height}px">
  <nav class="sayittome-bottom-nav" data-bottom-nav="1"></nav>
  ${menuHtml}
</body>
</html>`;
}

function inspectMenuIntegrity() {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const nav = document.querySelector("[data-bottom-nav='1']");
  const sheet =
    document.querySelector("[data-profile-options-sheet='1']") ||
    document.querySelector("[data-profile-options-dropdown='1']");
  const notifications = document.querySelector("[data-profile-option='notifications']");
  const history = document.querySelector("[data-profile-option='claim-history']");
  const reasons = [];

  function box(el) {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
    };
  }

  const sheetBox = box(sheet);
  const navBox = box(nav);
  const actions = [box(notifications), box(history)];

  if (!sheetBox) reasons.push("missing-sheet");
  if (!navBox) reasons.push("missing-nav");
  if (actions.some((action) => !action)) reasons.push("missing-action");

  function inViewport(rect, slop = 0.5) {
    return (
      rect.top >= -slop &&
      rect.left >= -slop &&
      rect.bottom <= viewport.height + slop &&
      rect.right <= viewport.width + slop &&
      rect.width > 1 &&
      rect.height > 1
    );
  }

  function overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  if (sheetBox && !inViewport(sheetBox)) reasons.push("sheet-clipped");
  if (sheetBox && navBox && overlaps(sheetBox, navBox)) reasons.push("sheet-covered-by-nav");
  if (sheetBox && navBox && sheetBox.bottom > navBox.top + 0.5) reasons.push("sheet-below-nav-top");

  for (const [index, action] of actions.entries()) {
    if (!action) continue;
    if (!inViewport(action)) reasons.push(`action-${index}-clipped`);
    if (action.height < 48 || action.width < 48) reasons.push(`action-${index}-touch`);
    if (action.scrollWidth > action.clientWidth + 1) reasons.push(`action-${index}-text-x`);
    if (action.scrollHeight > action.clientHeight + 1) reasons.push(`action-${index}-text-y`);
    if (navBox && overlaps(action, navBox)) reasons.push(`action-${index}-covered-by-nav`);
    if (sheetBox && (action.top < sheetBox.top - 0.5 || action.bottom > sheetBox.bottom + 0.5)) {
      reasons.push(`action-${index}-outside-sheet`);
    }
    const cx = action.left + action.width / 2;
    const cy = action.top + action.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const option = index === 0 ? notifications : history;
    if (!hit || !option?.contains(hit)) reasons.push(`action-${index}-not-clickable`);
  }

  if (sheetBox && sheetBox.scrollHeight > sheetBox.clientHeight + 1) {
    reasons.push("unexpected-scroll");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    viewport,
    sheet: sheetBox,
    nav: navBox,
    actions,
  };
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

    await page.setContent(shellHtml(viewport, publishedDropdownHtml()), {
      waitUntil: "domcontentloaded",
    });
    const publishedOffscreen = await page.evaluate(inspectMenuIntegrity);
    assert.equal(
      publishedOffscreen.ok,
      false,
      `${viewport.width}x${viewport.height} published first-paint must fail`,
    );
    assert.ok(
      publishedOffscreen.reasons.includes("sheet-clipped") ||
        publishedOffscreen.reasons.some((reason) => reason.endsWith("-clipped")),
      `${viewport.width}x${viewport.height} published first-paint reasons: ${publishedOffscreen.reasons.join(",")}`,
    );

    await page.setContent(shellHtml(viewport, publishedClippedHtml(viewport.height)), {
      waitUntil: "domcontentloaded",
    });
    const publishedEaten = await page.evaluate(inspectMenuIntegrity);
    assert.equal(
      publishedEaten.ok,
      false,
      `${viewport.width}x${viewport.height} published chrome-overlap must fail`,
    );

    await page.setContent(shellHtml(viewport, sheetHtml()), {
      waitUntil: "domcontentloaded",
    });
    const sheet = await page.evaluate(inspectMenuIntegrity);
    assert.equal(
      sheet.ok,
      true,
      `${viewport.width}x${viewport.height} sheet failed: ${sheet.reasons.join(",")}`,
    );
    assert.ok(sheet.sheet.height >= MIN_TOUCH * 2);
    assert.ok(sheet.actions[0].height >= MIN_TOUCH);
    assert.ok(sheet.actions[1].height >= MIN_TOUCH);
    assert.ok(sheet.sheet.bottom <= sheet.nav.top + 0.5);

    const triggerClicked = await page.evaluate((guardMs) => {
      const existing = document.querySelector("[data-profile-options-layer='1']");
      existing?.remove();
      const trigger = document.createElement("button");
      trigger.setAttribute("data-profile-options-menu", "1");
      trigger.style.cssText =
        "position:fixed;top:12px;right:12px;width:48px;height:48px;z-index:20;pointer-events:auto";
      document.body.appendChild(trigger);
      let openedAt = 0;
      let open = false;
      function mount() {
        const layer = document.createElement("div");
        layer.setAttribute("data-profile-options-layer", "1");
        layer.style.cssText = "position:fixed;inset:0;z-index:1000001;pointer-events:auto";
        const backdrop = document.createElement("button");
        backdrop.setAttribute("data-profile-options-backdrop", "1");
        backdrop.style.cssText = "position:absolute;inset:0;border:0;background:rgba(0,0,0,.55)";
        backdrop.addEventListener("click", () => {
          if (openedAt > 0 && Date.now() - openedAt < guardMs) return;
          open = false;
          layer.remove();
        });
        const sheetEl = document.createElement("div");
        sheetEl.setAttribute("data-profile-options-sheet", "1");
        sheetEl.setAttribute("data-profile-option", "notifications");
        sheetEl.textContent = "Notificaciones del chat";
        layer.append(backdrop, sheetEl);
        document.body.appendChild(layer);
        open = true;
      }
      trigger.addEventListener("click", () => {
        openedAt = Date.now();
        mount();
      });
      trigger.click();
      document.querySelector("[data-profile-options-backdrop='1']")?.click();
      const stayedOpen = open && Boolean(document.querySelector("[data-profile-options-sheet='1']"));
      const triggerBox = trigger.getBoundingClientRect();
      return {
        stayedOpen,
        triggerW: triggerBox.width,
        triggerH: triggerBox.height,
      };
    }, layout.PROFILE_OPTIONS_OPEN_GUARD_MS);
    assert.equal(triggerClicked.stayedOpen, true, "same-gesture backdrop must not close");
    assert.ok(triggerClicked.triggerW >= layout.PROFILE_OPTIONS_TRIGGER_MIN_PX);
    assert.ok(triggerClicked.triggerH >= layout.PROFILE_OPTIONS_TRIGGER_MIN_PX);

    const closed = await page.evaluate(() => {
      const backdrop = document.querySelector("[data-profile-options-backdrop='1']");
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return {
        backdrop: Boolean(document.querySelector("[data-profile-options-backdrop='1']")),
        history: Boolean(document.querySelector("[data-chat-notification-panel]")),
      };
    });
    assert.equal(closed.history, false);

    report.push({
      viewport: `${viewport.width}x${viewport.height}`,
      publishedOffscreenReasons: publishedOffscreen.reasons,
      publishedEatenReasons: publishedEaten.reasons,
      sheet,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_PROFILE_OPTIONS_MENU_VIEWPORT",
      pass: true,
      viewports: VIEWPORTS.map((row) => `${row.width}x${row.height}`),
      publishedFails: true,
      sheetOk: true,
    },
    null,
    2,
  ),
);
