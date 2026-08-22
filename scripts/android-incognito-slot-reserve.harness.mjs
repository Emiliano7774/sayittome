/**
 * ANDROID_INCOGNITO_SLOT_RESERVE
 * Anon direct-to-Shuffle incognito banner reserves layout (wrap + chrome)
 * without overlay or post-auth jump.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const card = fs.readFileSync(
  path.join(root, "src/components/anonMatch/ClassicAnonConnectCard.tsx"),
  "utf8",
);
assert.match(card, /incognitoMode && !isProfileUser/);
assert.match(card, /anonIncognito|incognito: isIncognitoVisitor/);
assert.match(card, /data-shuffle-anon-incognito/);

const headerUi = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/classicHeaderUi.ts")).href
);
const stable = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleChromeStable.ts")).href
);

const ui = headerUi.getClassicShuffleHeaderUi(5);
assert.ok(ui.anonIncognitoSlotPx > ui.anonSlotPx, "incognito must reserve extra wrap lines");
assert.equal(
  ui.anonIncognitoSlotPx,
  ui.anonPtPx + 1 + headerUi.classicAnonIncognitoInnerPx(ui),
);

const reserved = stable.classicAnonSlotStyles(ui, true, { incognito: true });
const regular = stable.classicAnonSlotStyles(ui, true);
assert.ok(reserved.minHeight > regular.minHeight);
assert.equal(reserved.minHeight, reserved.height);
assert.equal(reserved.overflow, "hidden");

const pendingIncognito = stable.decideAnonCardChrome({
  authPending: true,
  uid: "",
  cached: null,
  hasActiveDirectChat: false,
  isProfileUser: false,
  isIncognitoVisitor: true,
  searching: false,
});
assert.equal(pendingIncognito.visibility, "reserved");
assert.equal(pendingIncognito.isIncognitoVisitor, true);

const mount = stable.createShuffleChromeMount(5);
const first = mount.paint({
  authPending: true,
  following: {
    hasSession: false,
    profiles: [],
    showSkeleton: true,
    showGuest: false,
    state: "skeleton",
  },
  anon: pendingIncognito,
});
const live = mount.paint({
  authPending: false,
  following: {
    hasSession: false,
    profiles: [],
    showSkeleton: false,
    showGuest: true,
    state: "guest",
  },
  anon: {
    visibility: "show",
    hiddenForActiveChat: false,
    isIncognitoVisitor: true,
    isProfileUser: false,
    searching: false,
    uid: "",
    state: "show",
  },
});
assert.equal(first.committedPx, ui.anonIncognitoSlotPx);
assert.equal(live.committedPx, first.committedPx, "no jump after auth resolves");
assert.equal(first.feedOffsetPx, live.feedOffsetPx, "feed offset stays reserved");

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_INCOGNITO_SLOT_RESERVE",
      pass: true,
      note: "Product chrome imported. Physical anon Android layout still PENDING.",
    },
    null,
    2,
  ),
);
