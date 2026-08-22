/**
 * SHUFFLE_EMPTY_HOST_RESTORE
 * Restart host is empty: presentExistingShuffleSnapshot must call
 * restorePinnedShuffleWindowSync before sampling. Keep origin shell
 * (presented=false) until React paints; next evaluation can present.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const recover = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleForegroundRecover.ts")).href
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

function card(id) {
  return {
    classList: { contains: (name) => name !== "sayittome-nav-scroll-spacer" },
    getAttribute: (name) => (name === "data-card-id" ? id : null),
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
  };
}

const ana = profile("ana", "u1");
const ada = profile("ada", "u2");
const leo = profile("leo", "u3");
cache.writeCachedShufflePool([ana, ada, leo, profile("mia", "u4")]);
const stored = cache.readCachedShufflePool() || [ana, ada, leo];
const storedIds = stored.slice(0, 3).map(
  (row) => ident.shuffleProfileIdentityKey(row) || row.username,
);

snapshot.clearShuffleViewportSnapshot();
snapshot.captureShuffleViewportSnapshot({
  cardId: storedIds[1],
  index: 1,
  scrollTop: 640,
  cardIds: storedIds,
});
pinned.clearPinnedShuffleWindow();
slots.resetShuffleWindowSlots();
assert.equal(slots.getVisibleShuffleProfiles().length, 0);

const hostState = {
  cards: [],
  names: new Set(["sayittome-shuffle-keepalive-frozen"]),
};

const host = {
  classList: {
    add(name) {
      hostState.names.add(name);
    },
    remove(name) {
      hostState.names.delete(name);
    },
    contains(name) {
      return hostState.names.has(name);
    },
  },
  style: { opacity: "0", visibility: "hidden", pointerEvents: "none" },
  querySelector(sel) {
    if (String(sel).includes("data-shuffle-list")) {
      return hostState.cards.length ? { children: hostState.cards } : null;
    }
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

const first = recover.presentExistingShuffleSnapshot({ reason: "chats-to-shuffle" });
assert.equal(first.presented, false, "empty host must not hide origin shell");
assert.equal(first.snapshotPainted, false);
assert.equal(first.remounted, false);
assert.equal(first.emptiedBackground, false);
assert.equal(host.classList.contains("sayittome-shuffle-keepalive-frozen"), true);
const reconstructed = slots.getVisibleShuffleProfiles();
assert.ok(reconstructed.length >= 3, "restore must run before empty-host sample");
assert.equal(
  ident.shuffleProfileIdentityKey(reconstructed[0]) || reconstructed[0].username,
  storedIds[0],
);

hostState.cards = storedIds.map((id) => card(id));
const second = recover.presentExistingShuffleSnapshot({ reason: "chats-to-shuffle" });
assert.equal(second.presented, true);
assert.equal(second.snapshotPainted, true);
assert.equal(second.hostFrozen, false);
assert.equal(host.classList.contains("sayittome-shuffle-keepalive-visible"), true);

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_EMPTY_HOST_RESTORE",
      pass: true,
      restored: reconstructed.length,
    },
    null,
    2,
  ),
);
