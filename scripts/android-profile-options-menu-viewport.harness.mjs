/**
 * ANDROID_PROFILE_OPTIONS_MENU_VIEWPORT
 * 3-dot profile menu must clamp to visualViewport + bottom-nav/safe-area
 * and scroll when the two actions do not fit.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const menuSrc = fs.readFileSync(
  path.join(root, "src/components/profile/ProfileClaimHistoryMenu.tsx"),
  "utf8",
);
assert.match(menuSrc, /fitAnchoredMenu/);
assert.match(menuSrc, /readVisualViewportBox/);
assert.match(menuSrc, /readBottomUiReserve/);
assert.match(menuSrc, /maxHeight/);
assert.match(menuSrc, /overflowY/);
assert.match(menuSrc, /visualViewport/);
assert.doesNotMatch(
  menuSrc,
  /top:\s*rect\.bottom\s*\+\s*8/,
);

const fit = await import(
  pathToFileURL(path.join(root, "src/lib/overlay/fitAnchoredMenu.ts")).href
);

const shortViewport = fit.fitAnchoredMenu({
  anchor: { top: 620, bottom: 664, left: 280, right: 360, width: 80, height: 44 },
  viewport: { offsetTop: 0, offsetLeft: 0, width: 390, height: 700 },
  menuWidth: 288,
  estimatedHeight: 128,
  padding: 8,
  bottomReserve: 90,
});
assert.ok(shortViewport.maxHeight >= 72);
const visibleHeight = Math.min(128, shortViewport.maxHeight);
if (shortViewport.placement === "below") {
  assert.ok(shortViewport.top + visibleHeight <= 700 - 90);
} else {
  assert.ok(shortViewport.top >= 8);
  assert.ok(shortViewport.top + visibleHeight <= 620);
}
assert.equal(shortViewport.placement, "above");

const flipped = fit.fitAnchoredMenu({
  anchor: { top: 640, bottom: 684, left: 280, right: 360, width: 80, height: 44 },
  viewport: { offsetTop: 80, offsetLeft: 0, width: 390, height: 520 },
  menuWidth: 288,
  estimatedHeight: 128,
  padding: 8,
  bottomReserve: 96,
});
assert.equal(flipped.placement, "above");
assert.ok(flipped.top >= 80);
assert.ok(flipped.maxHeight <= 520 - 96);
assert.ok(flipped.top + Math.min(128, flipped.maxHeight) <= 80 + 520 - 8 - 96);

const roomy = fit.fitAnchoredMenu({
  anchor: { top: 48, bottom: 92, left: 280, right: 360, width: 80, height: 44 },
  viewport: { offsetTop: 0, offsetLeft: 0, width: 390, height: 844 },
  menuWidth: 288,
  estimatedHeight: 128,
  padding: 8,
  bottomReserve: 74,
});
assert.equal(roomy.placement, "below");
assert.ok(roomy.top >= 92);

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_PROFILE_OPTIONS_MENU_VIEWPORT",
      pass: true,
      note: "Product fitter imported. Physical short Android + keyboard still PENDING.",
    },
    null,
    2,
  ),
);
