/**
 * SHUFFLE_VIEWPORT_SNAPSHOT
 * Profile → back and Chats→Shuffle share an atomic cardId + index + scroll
 * capture. Restoring must not overwrite a usable snapshot with zeros.
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
const scroll = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleFeedScroll.ts")).href
);
const pinned = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shufflePinnedWindow.ts")).href
);

snapshot.clearShuffleViewportSnapshot();

const resolved = snapshot.resolveShuffleActiveCard({
  profiles: [
    { username: "ana", uid: "1" },
    { username: "ada", uid: "2" },
    { username: "leo", uid: "3" },
  ],
  scrollTop: 840,
  cardHeight: 420,
});
assert.equal(resolved.index, 2);
assert.ok(resolved.cardId);

const captured = snapshot.captureShuffleViewportSnapshot({
  cardId: "sid:ada",
  index: 5,
  scrollTop: 1280,
  cardIds: ["sid:a", "sid:b", "sid:c", "sid:d", "sid:e", "sid:ada"],
});
assert.equal(captured.cardId, "sid:ada");
assert.equal(captured.index, 5);
assert.equal(captured.scrollTop, 1280);
assert.equal(snapshot.hasUsableShuffleViewportSnapshot(), true);

const overwritten = snapshot.captureShuffleViewportSnapshot({
  cardId: "",
  index: 0,
  scrollTop: 0,
});
assert.equal(overwritten.cardId, "sid:ada");
assert.equal(overwritten.index, 5);
assert.equal(overwritten.scrollTop, 1280);

scroll.captureShuffleFeedScroll(1280);
assert.equal(scroll.peekShuffleFeedScroll(), 1280);
scroll.captureShuffleFeedScroll(0);
assert.equal(scroll.peekShuffleFeedScroll(), 1280, "must not overwrite scroll with 0");

let applied = 0;
const restored = snapshot.restoreShuffleViewportSnapshot({
  applyScroll: (value) => {
    applied = value;
    return true;
  },
});
assert.equal(restored.cardId, "sid:ada");
assert.equal(restored.index, 5);
assert.equal(applied, 1280);

assert.equal(typeof pinned.restorePinnedShuffleWindowSync, "function");
assert.equal(typeof pinned.applyPinnedShuffleWindowSync, "function");

const skipped = snapshot.collectShuffleFeedCardNodes({
  children: [
    {
      classList: { contains: (name) => name === "sayittome-shuffle-ad" },
      getAttribute: (name) => (name === "data-shuffle-ad" ? "1" : null),
    },
    {
      classList: { contains: () => false },
      getAttribute: (name) => (name === "data-card-id" ? "sid:ada" : null),
      offsetTop: 200,
      offsetHeight: 420,
    },
  ],
});
assert.equal(skipped.length, 1);
const afterAd = snapshot.resolveShuffleActiveCardFromFeedNodes({
  nodes: skipped,
  scrollTop: 208,
  profiles: [
    { username: "ada", uid: "2" },
    { username: "leo", uid: "3" },
  ],
});
assert.equal(afterAd.cardId, "sid:ada");
assert.equal(afterAd.index, 0);

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

const ana = profile("ana", "u1");
const ada = profile("ada", "u2");
const leo = profile("leo", "u3");
const adaId = ident.shuffleProfileIdentityKey(ada) || "ada";

cache.writeCachedShufflePool([ana, ada, leo, profile("mia", "u4")]);
const stored = cache.readCachedShufflePool() || [ana, ada, leo];
const storedIds = stored.slice(0, 3).map(
  (row) => ident.shuffleProfileIdentityKey(row) || row.username,
);
snapshot.clearShuffleViewportSnapshot();
snapshot.captureShuffleViewportSnapshot({
  cardId: storedIds[1] || adaId,
  index: 1,
  scrollTop: 640,
  cardIds: storedIds,
});
pinned.clearPinnedShuffleWindow();
slots.resetShuffleWindowSlots();
assert.equal(slots.getVisibleShuffleProfiles().length, 0);

const restarted = pinned.restorePinnedShuffleWindowSync();
assert.equal(restarted, true);
const visible = slots.getVisibleShuffleProfiles();
assert.ok(visible.length >= 3, "runtime restart must reconstruct content");
assert.equal(ident.shuffleProfileIdentityKey(visible[0]) || visible[0].username, storedIds[0]);
assert.equal(ident.shuffleProfileIdentityKey(visible[1]) || visible[1].username, storedIds[1]);
assert.equal(ident.shuffleProfileIdentityKey(visible[2]) || visible[2].username, storedIds[2]);

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_VIEWPORT_SNAPSHOT",
      pass: true,
      cardId: restored.cardId,
      index: restored.index,
      scrollTop: restored.scrollTop,
    },
    null,
    2,
  ),
);
