/**
 * SHUFFLE_SNAPSHOT_PROFILES_RESTORE — exact cardIds/order when pool cache lacks rows.
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

function profile(username, uid) {
  return { uid, username, bio: "", photo: "", showOnline: false, blurPhoto: false };
}

const ana = profile("ana", "u1");
const ada = profile("ada", "u2");
const leo = profile("leo", "u3");
const mia = profile("mia", "u4");
const windowProfiles = [ana, ada, leo];
const windowIds = windowProfiles.map(
  (row) => ident.shuffleProfileIdentityKey(row) || row.username,
);

snapshot.clearShuffleViewportSnapshot();
pinned.clearPinnedShuffleWindow();
slots.resetShuffleWindowSlots();

snapshot.captureShuffleViewportSnapshot({
  cardId: windowIds[1],
  index: 1,
  scrollTop: 920,
  cardIds: windowIds,
  profiles: windowProfiles,
});

// Pool refreshed without ada — snapshot.profiles must still restore exact order.
cache.writeCachedShufflePool([ana, leo, mia]);
assert.equal(slots.getVisibleShuffleProfiles().length, 0);

assert.equal(pinned.restorePinnedShuffleWindowSync(), true);
const visible = slots.getVisibleShuffleProfiles();
assert.equal(visible.length, 3);
assert.deepEqual(
  visible.map((row) => ident.shuffleProfileIdentityKey(row) || row.username),
  windowIds,
  "must preserve exact ids/order even when ada missing from pool cache",
);
assert.equal(ident.shuffleProfileIdentityKey(visible[1]) || visible[1].username, windowIds[1]);

const pinnedSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(root, "src/lib/shuffle/shufflePinnedWindow.ts"), "utf8"),
);
assert.doesNotMatch(
  pinnedSrc,
  /applyPinnedShuffleWindowSync\(\{ force: true \}\)/,
  "force pinned must not override snapshot order",
);

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_SNAPSHOT_PROFILES_RESTORE",
      pass: true,
      cardIds: windowIds,
    },
    null,
    2,
  ),
);
