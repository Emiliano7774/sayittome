/**
 * SHUFFLE_PROFILE_BACK_VIEWPORT
 * Mid-feed → profile → Android back must keep card/window/scroll.
 * Published remount/pool-warm forceWindow overwrites the snapshot.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

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
const recover = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleForegroundRecover.ts")).href
);

function profile(username, uid) {
  return {
    uid,
    username,
    bio: "",
    photo: "",
    showOnline: false,
    blurPhoto: false,
  };
}

const ana = profile("ana", "u1");
const ada = profile("ada", "u2");
const leo = profile("leo", "u3");
const mia = profile("mia", "u4");
cache.writeCachedShufflePool([ana, ada, leo, mia]);
const stored = cache.readCachedShufflePool() || [ana, ada, leo];
const storedIds = stored.slice(0, 3).map(
  (row) => ident.shuffleProfileIdentityKey(row) || row.username,
);

snapshot.clearShuffleViewportSnapshot();
snapshot.captureShuffleViewportSnapshot({
  cardId: storedIds[1],
  index: 1,
  scrollTop: 1280,
  cardIds: storedIds,
});
assert.equal(snapshot.hasUsableShuffleViewportSnapshot(), true);

assert.equal(
  snapshot.shouldPreserveShuffleWindowOnRestore({
    suppressRefresh: false,
    pinnedCount: 0,
    visibleCount: 0,
  }),
  true,
  "published remount forceWindow ignored a usable mid-feed snapshot",
);
assert.equal(
  snapshot.shouldPreserveShuffleWindowOnRestore({
    suppressRefresh: true,
    pinnedCount: 0,
    visibleCount: 0,
  }),
  true,
);
assert.equal(
  snapshot.shouldPreserveShuffleWindowOnRestore({
    suppressRefresh: false,
    pinnedCount: 0,
    visibleCount: 0,
  }) || snapshot.hasUsableShuffleViewportSnapshot(),
  true,
);

pinned.clearPinnedShuffleWindow();
slots.resetShuffleWindowSlots();
assert.equal(slots.getVisibleShuffleProfiles().length, 0);

const restored = pinned.restorePinnedShuffleWindowSync();
assert.equal(restored, true);
const visible = slots.getVisibleShuffleProfiles();
assert.ok(visible.length >= 3);
assert.equal(ident.shuffleProfileIdentityKey(visible[1]) || visible[1].username, storedIds[1]);

assert.equal(
  snapshot.isShuffleRestoreApplySuccess({
    actual: 120,
    target: 1280,
    scrollHeight: 800,
    clientHeight: 700,
  }),
  false,
  "published >0 would accept a clamp of 120 and stop retries",
);
assert.equal(
  snapshot.isShuffleRestoreApplySuccess({
    actual: 640,
    target: 1280,
    scrollHeight: 1400,
    clientHeight: 700,
  }),
  false,
);
assert.equal(
  snapshot.isShuffleRestoreApplySuccess({
    actual: 1280,
    target: 1280,
    scrollHeight: 2200,
    clientHeight: 700,
  }),
  true,
);
assert.equal(
  snapshot.isShuffleRestoreApplySuccess({
    actual: 640,
    target: 1280,
    scrollHeight: 2200,
    clientHeight: 700,
    targetCardVisible: true,
  }),
  false,
  "visible card at 640 must not count as the captured 1280 position",
);

const progressive = [120, 640, 1280];
const appliedProgress = [];
const retryQueue = [];
const snap = snapshot.restoreShuffleViewportSnapshot({
  applyScroll: (target) => {
    const actual = progressive[Math.min(appliedProgress.length, progressive.length - 1)];
    appliedProgress.push(actual);
    return snapshot.isShuffleScrollRestoreExact(actual, target);
  },
  attempts: 8,
  schedule: (cb) => {
    retryQueue.push(cb);
  },
});
assert.equal(snap.cardId, storedIds[1]);
assert.equal(snap.index, 1);
assert.equal(appliedProgress.length, 1);
assert.equal(appliedProgress[0], 120);
assert.equal(retryQueue.length, 1, "must keep retrying after first clamp");
retryQueue.shift()();
assert.equal(appliedProgress.length, 2);
assert.equal(appliedProgress[1], 640);
assert.equal(retryQueue.length, 1, "must not close before the third apply");
retryQueue.shift()();
assert.equal(appliedProgress.length, 3);
assert.equal(appliedProgress[2], 1280);
assert.equal(retryQueue.length, 0, "exact 1280 ends retries");

const staleQueue = [];
snapshot.restoreShuffleViewportSnapshot({
  applyScroll: () => false,
  attempts: 8,
  schedule: (cb) => {
    staleQueue.push(cb);
  },
});
const staleToken = snapshot.peekShuffleViewportRestoreGeneration();
snapshot.cancelShuffleViewportSnapshotRestore();
assert.notEqual(snapshot.peekShuffleViewportRestoreGeneration(), staleToken);
const beforeStale = appliedProgress.length;
staleQueue.shift()?.();
assert.equal(appliedProgress.length, beforeStale, "stale retry must not apply");

const applied = appliedProgress[appliedProgress.length - 1];

const hostState = { cards: storedIds.map(() => ({
  classList: { contains: (name) => name !== "sayittome-nav-scroll-spacer" },
  getAttribute: () => null,
  childNodes: [1],
  offsetWidth: 390,
  offsetHeight: 420,
  getBoundingClientRect: () => ({ width: 390, height: 420, top: 0, left: 0, right: 390, bottom: 420 }),
})) };
const host = {
  classList: {
    names: new Set(["sayittome-shuffle-keepalive-visible"]),
    add(name) { this.names.add(name); },
    remove(name) { this.names.delete(name); },
    contains(name) { return this.names.has(name); },
  },
  style: { opacity: "1", visibility: "visible", pointerEvents: "" },
  querySelector(sel) {
    if (String(sel).includes("data-shuffle-list")) return { children: hostState.cards };
    return null;
  },
  querySelectorAll() { return hostState.cards; },
  hasAttribute() { return false; },
  setAttribute() {},
  removeAttribute() {},
};
const previousDocument = globalThis.document;
globalThis.document = {
  ...previousDocument,
  documentElement: {
    classList: { add() {}, remove() {}, contains() { return false; } },
    hasAttribute() { return false; },
    getAttribute() { return null; },
    setAttribute() {},
    removeAttribute() {},
  },
  body: { classList: { add() {}, remove() {}, contains() { return false; } } },
  getElementById(id) {
    return id === recover.SHUFFLE_KEEPALIVE_HOST_ID ? host : null;
  },
};
globalThis.window.location.pathname = "/shuffle";

const presented = recover.presentExistingShuffleSnapshot({ reason: "profile-back" });
assert.equal(presented.presented, true);
assert.equal(presented.remounted, false);
const afterPresent = slots.getVisibleShuffleProfiles();
assert.equal(
  ident.shuffleProfileIdentityKey(afterPresent[1]) || afterPresent[1].username,
  storedIds[1],
);

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_PROFILE_BACK_VIEWPORT",
      pass: true,
      cardId: snap.cardId,
      index: snap.index,
      scrollTop: applied,
    },
    null,
    2,
  ),
);
