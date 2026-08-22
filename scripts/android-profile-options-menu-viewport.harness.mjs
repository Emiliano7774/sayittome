/**
 * ANDROID_PROFILE_OPTIONS_MENU_VIEWPORT
 * Real /u/[username] menu (ProfileClaimHistoryMenu) is measured, then
 * fitted to a 390×700 visualViewport with two actions visible.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const pageSrc = fs.readFileSync(
  path.join(root, "src/app/u/[username]/page.tsx"),
  "utf8",
);
const menuSrc = fs.readFileSync(
  path.join(root, "src/components/profile/ProfileClaimHistoryMenu.tsx"),
  "utf8",
);
assert.match(pageSrc, /ProfileClaimHistoryMenu/);
const portal = await import(
  pathToFileURL(path.join(root, "src/lib/overlay/profileOptionsMenuPortal.ts")).href
);
const portalBody = { nodeType: 1, name: "body" };
assert.equal(portal.resolveProfileOptionsMenuPortalRoot({ body: portalBody }), portalBody);
assert.equal(portal.resolveProfileOptionsMenuPortalRoot(null), null);
assert.match(menuSrc, /resolveProfileOptionsMenuPortalRoot/);
assert.match(menuSrc, /measuredHeight/);
assert.match(menuSrc, /dropdownRef/);
assert.match(menuSrc, /measureMenuBox/);
assert.match(menuSrc, /unlockDocumentFixedClip/);
assert.match(menuSrc, /visibility: menuPos \? "visible" : "hidden"/);
assert.match(
  fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8"),
  /overflow-x:\s*clip/,
);
assert.doesNotMatch(menuSrc, /top:\s*0,\s*\n\s*right:\s*16/);

const fit = await import(
  pathToFileURL(path.join(root, "src/lib/overlay/fitAnchoredMenu.ts")).href
);

const ACTION = 48;
const TWO_ACTIONS = ACTION * 2 + 16;

const short = fit.fitAnchoredMenu({
  anchor: { top: 48, bottom: 92, left: 280, right: 360, width: 80, height: 44 },
  viewport: { offsetTop: 0, offsetLeft: 0, width: 390, height: 700 },
  menuWidth: 288,
  estimatedHeight: TWO_ACTIONS,
  measuredHeight: TWO_ACTIONS,
  minVisibleCount: 2,
  itemHeight: ACTION,
  padding: 8,
  bottomReserve: 90,
});
assert.equal(short.placement, "below");
assert.ok(short.maxHeight >= TWO_ACTIONS);
assert.equal(short.overflowY, "visible");
assert.ok(short.top >= 92);
assert.ok(short.top + TWO_ACTIONS <= 700 - 90);

const cramped = fit.fitAnchoredMenu({
  anchor: { top: 620, bottom: 664, left: 280, right: 360, width: 80, height: 44 },
  viewport: { offsetTop: 0, offsetLeft: 0, width: 390, height: 700 },
  menuWidth: 288,
  estimatedHeight: TWO_ACTIONS,
  measuredHeight: TWO_ACTIONS,
  minVisibleCount: 2,
  itemHeight: ACTION,
  padding: 8,
  bottomReserve: 90,
});
assert.equal(cramped.placement, "above");
assert.ok(cramped.top >= 8);
assert.ok(cramped.top + Math.min(TWO_ACTIONS, cramped.maxHeight) <= 620);
assert.ok(cramped.maxHeight >= ACTION * 2 || cramped.overflowY === "auto");

const tall = fit.fitAnchoredMenu({
  anchor: { top: 200, bottom: 244, left: 280, right: 360, width: 80, height: 44 },
  viewport: { offsetTop: 80, offsetLeft: 0, width: 390, height: 400 },
  menuWidth: 288,
  estimatedHeight: 320,
  measuredHeight: 320,
  minVisibleCount: 2,
  itemHeight: ACTION,
  padding: 8,
  bottomReserve: 96,
});
assert.equal(tall.overflowY, "auto");
assert.ok(tall.maxHeight < 320);
assert.ok(tall.maxHeight >= ACTION * 2);

const clip = await import(
  pathToFileURL(path.join(root, "src/lib/overlay/menuClipAudit.ts")).href
);
const hiddenClip = clip.collectFixedClipAncestors([
  { style: { overflowX: "hidden", overflowY: "visible" } },
]);
assert.equal(hiddenClip.length, 1, "published overflow-x:hidden clips fixed menus");
assert.equal(
  clip.doesOverflowClipFixed({ overflowX: "clip", overflowY: "visible" }),
  false,
);
const clippedMeasure = clip.measureMenuBox({
  scrollHeight: TWO_ACTIONS,
  clientHeight: 40,
  boundingHeight: 40,
});
assert.equal(clippedMeasure.clipped, true);
assert.equal(clippedMeasure.intrinsicHeight, TWO_ACTIONS);
const fittedFromClip = fit.fitAnchoredMenu({
  anchor: { top: 48, bottom: 92, left: 280, right: 360, width: 80, height: 44 },
  viewport: { offsetTop: 0, offsetLeft: 0, width: 390, height: 700 },
  menuWidth: 288,
  estimatedHeight: clippedMeasure.visibleHeight,
  measuredHeight: clippedMeasure.intrinsicHeight,
  minVisibleCount: 2,
  itemHeight: ACTION,
  padding: 8,
  bottomReserve: 90,
});
assert.ok(fittedFromClip.maxHeight >= TWO_ACTIONS);
assert.equal(
  clip.areMenuActionsFullyVisible({
    actions: [
      { top: fittedFromClip.top, bottom: fittedFromClip.top + ACTION, left: 72, right: 360 },
      {
        top: fittedFromClip.top + ACTION,
        bottom: fittedFromClip.top + ACTION * 2,
        left: 72,
        right: 360,
      },
    ],
    viewport: { offsetTop: 0, offsetLeft: 0, width: 390, height: 700 },
  }),
  true,
);

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_PROFILE_OPTIONS_MENU_VIEWPORT",
      pass: true,
      viewport: "390x700",
      twoActionsVisible: true,
    },
    null,
    2,
  ),
);
