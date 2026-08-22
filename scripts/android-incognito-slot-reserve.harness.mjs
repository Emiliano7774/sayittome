/**
 * ANDROID_INCOGNITO_SLOT_RESERVE
 * Real classic+modern first-paint block occupies normal flow. Late auth
 * must not shift the measured flow height, clip, or overlay.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const classicSrc = fs.readFileSync(
  path.join(root, "src/components/anonMatch/ClassicAnonConnectCard.tsx"),
  "utf8",
);
const modernSrc = fs.readFileSync(
  path.join(root, "src/components/anonMatch/ModernAnonConnectCard.tsx"),
  "utf8",
);
assert.match(classicSrc, /resolveAnonCardFirstPaint/);
assert.match(classicSrc, /resolveAnonCardOccupy/);
assert.match(classicSrc, /resolveAnonCardIdentity/);
assert.doesNotMatch(classicSrc, /setAnonCommitPx\(committedPx\)/);
assert.doesNotMatch(classicSrc, /overflow:\s*slotBox\.overflow/);
assert.match(modernSrc, /resolveAnonCardFirstPaint/);
assert.match(modernSrc, /resolveAnonCardOccupy/);
assert.match(modernSrc, /resolveAnonCardIdentity/);
assert.doesNotMatch(modernSrc, /if \(!match \|\| loading\) return null/);
assert.doesNotMatch(modernSrc, /!firstPaint\.occupy\) return null/);

const headerUi = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/classicHeaderUi.ts")).href
);
const stable = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleChromeStable.ts")).href
);

const ui = headerUi.getClassicShuffleHeaderUi(5);
const first = stable.resolveAnonCardFirstPaint({
  uid: "",
  cached: null,
  legalIncognito: true,
});
assert.equal(first.occupy, true);
assert.equal(first.isIncognitoVisitor, true);

const lateAuthSame = stable.resolveAnonCardFirstPaint({
  uid: "",
  cached: {
    version: 3,
    uid: "",
    show: true,
    hiddenForActiveChat: false,
    isIncognitoVisitor: true,
    isProfileUser: false,
    searching: false,
  },
  legalIncognito: true,
});
const firstPx = stable.measureAnonCardFlowHeight(ui, {
  occupy: first.occupy,
  incognito: first.isIncognitoVisitor,
});
const livePx = stable.measureAnonCardFlowHeight(ui, {
  occupy: lateAuthSame.occupy,
  incognito: lateAuthSame.isIncognitoVisitor,
});
assert.equal(firstPx, livePx);
assert.ok(firstPx > 0);

const slot = stable.classicAnonSlotStyles(ui, true);
assert.equal(slot.overflow, "visible");
assert.equal(slot.height, "auto");
assert.equal(slot.minHeight, 0);

assert.equal(
  stable.resolveAnonCardOccupy({
    authPending: true,
    firstPaintOccupy: true,
    hiddenForActiveChat: false,
    liveOccupy: false,
  }),
  true,
  "late auth keeps first-paint occupy",
);
assert.equal(
  stable.resolveAnonCardOccupy({
    authPending: false,
    firstPaintOccupy: true,
    hiddenForActiveChat: false,
    liveOccupy: false,
  }),
  false,
  "resolved auth uses liveOccupy only",
);
assert.equal(
  stable.resolveAnonCardOccupy({
    authPending: false,
    firstPaintOccupy: true,
    hiddenForActiveChat: true,
    liveOccupy: true,
  }),
  false,
  "accepted direct chat must hide sticky occupy",
);

const pendingAnonId = stable.resolveAnonCardIdentity({
  authPending: true,
  firstPaint: { isIncognitoVisitor: true, isProfileUser: false },
  live: { isIncognitoVisitor: false, isProfileUser: true },
});
assert.equal(pendingAnonId.isIncognitoVisitor, true, "pending keeps first-paint incognito");

const liveProfileId = stable.resolveAnonCardIdentity({
  authPending: false,
  firstPaint: { isIncognitoVisitor: true, isProfileUser: false },
  live: { isIncognitoVisitor: false, isProfileUser: true },
});
assert.equal(liveProfileId.isIncognitoVisitor, false, "anon→profile must drop incognito label");
assert.equal(liveProfileId.isProfileUser, true);

const decision = stable.decideAnonCardChrome({
  authPending: true,
  uid: "",
  cached: null,
  hasActiveDirectChat: false,
  isProfileUser: false,
  isIncognitoVisitor: true,
  searching: false,
});
const afterAuth = stable.decideAnonCardChrome({
  authPending: false,
  uid: "",
  cached: null,
  hasActiveDirectChat: false,
  isProfileUser: false,
  isIncognitoVisitor: true,
  searching: false,
});
assert.equal(
  stable.measureAnonCardFlowHeight(ui, {
    occupy: true,
    incognito: decision.isIncognitoVisitor,
  }),
  stable.measureAnonCardFlowHeight(ui, {
    occupy: afterAuth.visibility === "show",
    incognito: afterAuth.isIncognitoVisitor,
  }),
);

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_INCOGNITO_SLOT_RESERVE",
      pass: true,
      firstPx,
      livePx,
    },
    null,
    2,
  ),
);
