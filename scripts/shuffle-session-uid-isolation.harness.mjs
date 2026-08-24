/**
 * SHUFFLE_SESSION_UID_ISOLATION
 * A→B account switch never restores A's order/scroll; null transient does not clear.
 * Modern card leave captures filters/search/batch via live capture context.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const session = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleSessionSnapshot.ts")).href
);
const snapshot = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleViewportSnapshot.ts")).href
);
const pinned = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shufflePinnedWindow.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClientCache.ts")).href
);
const slots = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleSlotsStore.ts")).href
);
const ident = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/dedupeProfiles.ts")).href
);
const filters = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/filters.ts")).href
);

function profile(username, uid) {
  return { uid, username, bio: "", photo: "", showOnline: false, blurPhoto: false };
}

session.clearShuffleSessionSnapshot();
try {
  window.sessionStorage.removeItem("sayittome:auth-uid");
} catch {
  /* ignore */
}

const ana = profile("ana", "u1");
const ada = profile("ada", "u2");
const leo = profile("leo", "u3");
cache.writeCachedShufflePool([ana, ada, leo]);
const idsA = [ana, ada, leo].map(
  (row) => ident.shuffleProfileIdentityKey(row) || row.username,
);

// Bind account A and capture mid-feed snapshot.
const bindA = session.bindShuffleSessionUid("uid-A");
assert.equal(bindA.bound, true);
assert.equal(bindA.cleared, false);
assert.equal(session.readShuffleSessionUid(), "uid-A");

session.publishShuffleSessionCaptureContext({
  filters: { ...filters.defaultShuffleFilters(), soloOnline: true },
  search: "query-a",
  batchPages: [["batch-a-1"], ["batch-a-2"]],
});

session.captureShuffleSessionSnapshot({
  cardId: idsA[1],
  index: 1,
  scrollTop: 2200,
  cardIds: idsA,
  pinVisibleWindow: false,
});
assert.equal(snapshot.hasUsableShuffleViewportSnapshot(), true);
const extrasA = session.peekShuffleSessionExtras();
assert.ok(extrasA);
assert.equal(extrasA.sessionUid, "uid-A");
assert.equal(extrasA.scrollTop, 2200);
assert.equal(extrasA.search, "query-a");
assert.deepEqual(extrasA.batchPages[0], ["batch-a-1"]);
assert.ok(extrasA.filterFingerprint.includes("soloOnline"));

// Transient null must NOT clear A's snapshot.
const transient = session.bindShuffleSessionUid(null);
assert.equal(transient.bound, false);
assert.equal(transient.cleared, false);
assert.equal(session.readShuffleSessionUid(), "uid-A");
assert.equal(snapshot.hasUsableShuffleViewportSnapshot(), true);
assert.equal(session.peekShuffleSessionExtras()?.scrollTop, 2200);

session.bindShuffleSessionUid("");
assert.equal(session.readShuffleSessionUid(), "uid-A");
assert.equal(snapshot.hasUsableShuffleViewportSnapshot(), true);

// Account B: must clear A's order/scroll and never restore them.
const bindB = session.bindShuffleSessionUid("uid-B");
assert.equal(bindB.bound, true);
assert.equal(bindB.cleared, true);
assert.equal(session.readShuffleSessionUid(), "uid-B");
assert.equal(snapshot.hasUsableShuffleViewportSnapshot(), false);
assert.equal(session.peekShuffleSessionExtras(), null);

pinned.clearPinnedShuffleWindow();
slots.resetShuffleWindowSlots();
// Even if A left cardIds in cache, B has no usable session — must not rebuild A's window.
const restoredForB = pinned.restorePinnedShuffleWindowSync();
const visibleB = slots.getVisibleShuffleProfiles();
if (restoredForB && visibleB.length > 0) {
  const order = visibleB.map(
    (row) => ident.shuffleProfileIdentityKey(row) || row.username,
  );
  assert.notDeepEqual(
    order.slice(0, idsA.length),
    idsA,
    "B must never restore A's ordered window from cleared session",
  );
}

// Modern card path uses live capture context for filters/search/batch.
session.clearShuffleSessionSnapshot();
session.bindShuffleSessionUid("uid-B");
session.publishShuffleSessionCaptureContext({
  filters: { ...filters.defaultShuffleFilters(), soloConFoto: true },
  search: "modern-search",
  batchPages: [["m1", "m2"]],
});
const modernIds = idsA;
session.captureShuffleSessionSnapshot({
  cardId: modernIds[0],
  index: 0,
  scrollTop: 960,
  cardIds: modernIds,
  // omit filters/search/batch — must come from publish context (modern card).
  pinVisibleWindow: false,
});
const modernExtras = session.peekShuffleSessionExtras();
assert.ok(modernExtras);
assert.equal(modernExtras.search, "modern-search");
assert.deepEqual(modernExtras.batchPages[0], ["m1", "m2"]);
assert.ok(modernExtras.filterFingerprint.includes("soloConFoto"));
assert.equal(modernExtras.sessionUid, "uid-B");

const authSrc = fs.readFileSync(
  path.join(root, "src/contexts/AuthContext.tsx"),
  "utf8",
);
assert.match(authSrc, /authStateReady/);
assert.match(authSrc, /bindShuffleSessionUid/);
assert.match(authSrc, /user\?\.uid \?\? null/);

const modernSrc = fs.readFileSync(
  path.join(root, "src/components/modern/ModernShuffleCard.tsx"),
  "utf8",
);
assert.match(modernSrc, /captureShuffleSessionSnapshot/);
assert.doesNotMatch(modernSrc, /filters:\s/);

const poolSrc = fs.readFileSync(path.join(root, "src/hooks/useShufflePool.ts"), "utf8");
assert.match(poolSrc, /publishShuffleSessionCaptureContext/);

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_SESSION_UID_ISOLATION",
      pass: true,
      clearedOnAB: true,
      nullTransientPreserved: true,
      modernExtrasFromContext: true,
    },
    null,
    2,
  ),
);
