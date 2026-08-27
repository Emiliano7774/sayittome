/**
 * SHUFFLE_POPSTATE_RESTORE — profile leave + popstate must restore cardIds/order/scroll without reshuffle.
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
const instant = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/instantShuffleEntry.ts")).href
);
const recover = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleForegroundRecover.ts")).href
);

function profile(username, uid) {
  return { uid, username, bio: "", photo: "", showOnline: false, blurPhoto: false };
}

const rows = [profile("ana", "u1"), profile("ada", "u2"), profile("leo", "u3"), profile("mia", "u4")];
cache.writeCachedShufflePool(rows);
const storedIds = rows.slice(0, 3).map((row) => ident.shuffleProfileIdentityKey(row) || row.username);

snapshot.clearShuffleViewportSnapshot();
snapshot.captureShuffleViewportSnapshot({
  cardId: storedIds[1],
  index: 1,
  scrollTop: 960,
  cardIds: storedIds,
});

const popPlan = instant.planInstantShuffleEntry({
  fromPath: "/u/ada",
  alreadyOnShuffle: true,
  popstateRestore: true,
});
assert.equal(popPlan.zone, "popstate");
assert.equal(popPlan.reshuffle, false);
assert.equal(popPlan.presentHostSync, true);

pinned.clearPinnedShuffleWindow();
slots.resetShuffleWindowSlots();
assert.equal(pinned.restorePinnedShuffleWindowSync(), true);
const visible = slots.getVisibleShuffleProfiles();
assert.equal(ident.shuffleProfileIdentityKey(visible[1]) || visible[1].username, storedIds[1]);

const hostState = {
  cards: storedIds.map(() => ({
    classList: { contains: (name) => name !== "sayittome-nav-scroll-spacer" },
    getAttribute: () => null,
    childNodes: [1],
    offsetWidth: 390,
    offsetHeight: 420,
    getBoundingClientRect: () => ({
      width: 390,
      height: 420,
      top: 0,
      left: 0,
      right: 390,
      bottom: 420,
    }),
  })),
};
const host = {
  classList: {
    names: new Set(["sayittome-shuffle-keepalive-visible"]),
    add(name) {
      this.names.add(name);
    },
    remove(name) {
      this.names.delete(name);
    },
    contains(name) {
      return this.names.has(name);
    },
  },
  style: { opacity: "1", visibility: "visible", pointerEvents: "" },
  querySelector(sel) {
    if (String(sel).includes("data-shuffle-list")) return { children: hostState.cards };
    return null;
  },
  querySelectorAll() {
    return hostState.cards;
  },
  hasAttribute() {
    return false;
  },
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

const presented = recover.presentExistingShuffleSnapshot({ reason: "popstate-restore" });
assert.equal(presented.presented, true);
assert.equal(presented.remounted, false);

const snap = snapshot.restoreShuffleViewportSnapshot({
  applyScroll: (target) => target === 960,
  attempts: 4,
  schedule: () => {},
});
assert.equal(snap.cardId, storedIds[1]);
assert.equal(snap.index, 1);
assert.equal(snap.scrollTop, 960);

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_POPSTATE_RESTORE",
      pass: true,
      cardId: snap.cardId,
      order: storedIds,
      scrollTop: snap.scrollTop,
    },
    null,
    2,
  ),
);
