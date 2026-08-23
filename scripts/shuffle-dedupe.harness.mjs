/**
 * Shuffle identity dedupe: UID-canonical, stable keys, cache/live merge, no extra reads.
 * Usage: node --experimental-strip-types scripts/shuffle-dedupe.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const dedupe = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/dedupeProfiles.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClientCache.ts")).href
);
const chrome = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleChromeCache.ts")).href
);

const photo = "https://cdn.example.com/users/shared-photo.jpg";

function row(partial) {
  return {
    uid: "",
    username: "",
    photo: "",
    bio: "",
    blurPhoto: false,
    showOnline: false,
    ...partial,
  };
}

let fetches = 0;
const previousFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  fetches += 1;
  if (typeof previousFetch === "function") return previousFetch(...args);
  throw new Error("no fetch in harness");
};

const sameUidCache = row({
  uid: "doc-a",
  authUid: "fb-maria",
  username: "maria",
  photo: "",
});
const sameUidPage = row({
  uid: "fb-maria",
  username: "maria",
  photo: "https://cdn.example.com/maria.jpg",
  bio: "hola",
});
const sameUidLive = row({
  uid: "fb-maria",
  authUid: "fb-maria",
  username: "maria2",
  photo: "https://cdn.example.com/maria.jpg",
  bio: "hola",
  presenceAt: "2026-08-21T12:00:00.000Z",
});

const overlay = dedupe.overlayShuffleProfileSnapshots(
  [sameUidCache, row({ uid: "stale-gone", username: "ghost" })],
  [sameUidLive],
);
assert.equal(overlay.length, 1);
assert.equal(overlay[0].username, "maria2");
assert.equal(overlay.some((p) => p.uid === "stale-gone"), false);

const mergedUid = dedupe.mergeShuffleProfileSnapshots(
  [sameUidCache],
  [sameUidPage],
  [sameUidLive],
);
assert.equal(mergedUid.length, 1);
assert.equal(mergedUid[0].username, "maria2");
assert.equal(mergedUid[0].photo, "https://cdn.example.com/maria.jpg");
assert.equal(
  dedupe.shuffleProfileIdentityKey(sameUidCache),
  dedupe.shuffleProfileIdentityKey(sameUidLive),
);

const renamed = dedupe.dedupeShuffleProfiles([
  row({ uid: "fb-1", username: "old_name", photo: "" }),
  row({
    uid: "fb-1",
    username: "new_name",
    photo: "https://cdn.example.com/1.jpg",
    presenceAt: "2026-08-21T12:00:00.000Z",
  }),
]);
assert.equal(renamed.length, 1);
assert.equal(renamed[0].username, "new_name");
assert.equal(renamed[0].uid, "fb-1");
assert.match(dedupe.shuffleProfileIdentityKey(renamed[0]), /^sid:[0-9a-f]+$/);
assert.equal(
  dedupe.shuffleProfileIdentityKey(renamed[0]),
  dedupe.shuffleProfileIdentityKey(row({ uid: "fb-1", username: "other" })),
);

const alias = dedupe.dedupeShuffleProfiles([
  row({ username: "Ada." }),
  row({ username: "ada_" }),
  row({ username: "ada" }),
]);
assert.equal(alias.length, 1);
assert.match(dedupe.shuffleProfileIdentityKey(alias[0]), /^sid:[0-9a-f]+$/);
assert.equal(
  dedupe.shuffleProfileIdentityKey(alias[0]),
  dedupe.shuffleProfileIdentityKey(row({ username: "ada" })),
);

const anons = dedupe.dedupeShuffleProfiles([
  row({ uid: "anon_sess_1", username: "Guest", photo }),
  row({ uid: "anon_sess_2", username: "Guest", photo }),
]);
assert.equal(anons.length, 2);
assert.notEqual(
  dedupe.shuffleProfileIdentityKey(anons[0]),
  dedupe.shuffleProfileIdentityKey(anons[1]),
);

const bridgeA = row({ uid: "docA", authUid: "authA", username: "Ada" });
const bridgeB = row({ uid: "docB", authUid: "authB", username: "Bea" });
const bridgeC = row({ uid: "docA", authUid: "authB", username: "Ada" });
const bridge = dedupe.dedupeShuffleProfiles([bridgeA, bridgeB, bridgeC]);
assert.equal(
  bridge.length,
  1,
  `union-find bridge A/B/C must collapse to 1, got ${bridge.length}`,
);
assert.equal(
  dedupe.uniqueShuffleWindow([bridgeA, bridgeB, bridgeC]).length,
  1,
  "visible window must use union-find, not first-hit skip",
);

const emmPhoto = "https://cdn.example.com/users/Emm212-avatar.jpg";
const capture = dedupe.dedupeShuffleProfiles([
  row({ uid: "legacyDoc1", username: "Emm212", photo: emmPhoto }),
  row({ uid: "legacyDoc2", username: "Emm212", photo: emmPhoto }),
]);
assert.equal(
  capture.length,
  2,
  "same photo+name without uid/email/auth proof must not collapse",
);

const captureAnons = dedupe.dedupeShuffleProfiles([
  row({ uid: "anon_sess_1", username: "Emm212", photo: emmPhoto }),
  row({ uid: "anon_sess_2", username: "Emm212", photo: emmPhoto }),
]);
assert.equal(
  captureAnons.length,
  2,
  "anon_* sessions must stay distinct even with same username/photo",
);

const weakLegacy = dedupe.dedupeShuffleProfiles([
  row({ uid: "legacyDoc1", username: "Emm212" }),
  row({ uid: "legacyDoc2", username: "Emm212" }),
]);
assert.equal(
  weakLegacy.length,
  2,
  "username-only legacy docs without auth/email/photo must not collapse",
);

const emailJoin = dedupe.dedupeShuffleProfiles([
  row({
    uid: "legacyDoc1",
    authUid: "authEmm",
    username: "Emm212",
    email: "emm212@example.com",
  }),
  row({
    uid: "legacyDoc2",
    username: "Emm212",
    email: "emm212@example.com",
  }),
]);
assert.equal(emailJoin.length, 1, "canonical email must join registered duplicates");

const photoDistinct = dedupe.dedupeShuffleProfiles([
  row({ uid: "fb-a", username: "ada", photo }),
  row({ uid: "fb-b", username: "john", photo }),
]);
assert.equal(photoDistinct.length, 2);

const order = dedupe.dedupeShuffleProfiles([
  row({ uid: "z", username: "zeta" }),
  row({ uid: "a", username: "ada" }),
  row({ uid: "z", username: "zeta2", photo: "https://cdn.example.com/z.jpg" }),
]);
assert.equal(order.map((p) => p.uid).join(","), "z,a");

cache.writeCachedShufflePool(mergedUid);
const warm = cache.readCachedShufflePool();
assert.equal(warm?.length, 1);
assert.match(dedupe.shuffleProfileIdentityKey(warm[0]), /^sid:[0-9a-f]+$/);
assert.equal(
  dedupe.shuffleProfileIdentityKey(warm[0]),
  dedupe.shuffleProfileIdentityKey(sameUidLive),
);
assert.match(
  cache.SHUFFLE_POOL_KEY,
  new RegExp(`v${dedupe.SHUFFLE_DEDUPE_VERSION}$`),
);
assert.equal(dedupe.SHUFFLE_DEDUPE_VERSION, 16);

chrome.writeCachedFollowingSnapshot(
  "viewer",
  [
    { uid: "fb-maria", username: "maria", photo: "", showOnline: false },
    { uid: "fb-maria", username: "maria2", photo: "https://cdn.example.com/maria.jpg", showOnline: true },
  ],
  true,
);
const following = chrome.readCachedFollowingSnapshot("viewer");
assert.equal(following?.profiles.length, 1);
assert.equal(following.profiles[0].username, "maria2");
assert.equal(following.version, chrome.SHUFFLE_CHROME_CACHE_VERSION);

const n = 400;
const noisy = Array.from({ length: n }, (_, i) =>
  row({
    uid: i % 40 === 0 ? `shared-${i % 10}` : `uid-${i}`,
    authUid: i % 40 === 0 ? `shared-${i % 10}` : `uid-${i}`,
    username: i % 40 === 0 ? `user${i % 10}` : `user${i}`,
    photo: i % 7 === 0 ? photo : `https://cdn.example.com/${i}.jpg`,
  }),
);
const t0 = performance.now();
const collapsed = dedupe.dedupeShuffleProfiles(noisy);
const coldMs = performance.now() - t0;
assert.ok(collapsed.length < n);
assert.ok(coldMs < 20, `cold dedupe too slow: ${coldMs}`);

const t1 = performance.now();
const again = dedupe.dedupeShuffleProfiles(collapsed);
const warmMs = performance.now() - t1;
assert.equal(again.length, collapsed.length);
assert.ok(warmMs < 20, `warm dedupe too slow: ${warmMs}`);

const beforeKeys = collapsed.map((p) => dedupe.shuffleProfileIdentityKey(p));
const afterRename = collapsed.map((p, i) =>
  i === 0 ? { ...p, username: `${p.username}_renamed` } : p,
);
const afterKeys = afterRename.map((p) => dedupe.shuffleProfileIdentityKey(p));
assert.deepEqual(afterKeys, beforeKeys);

const liveIncomplete = row({
  uid: "fb-bridge",
  authUid: "fb-bridge",
  username: "randomdup",
  photo: "https://cdn.example.com/live-random.jpg",
});
const cacheIncomplete = row({
  uid: "doc-bridge",
  username: "randomdup",
  photo: "https://cdn.example.com/cache-random.jpg",
});
const featuredBridge = row({
  uid: "doc-bridge",
  authUid: "fb-bridge",
  username: "randomdup",
  shuffleFeatured: true,
});
const followingBridge = row({
  uid: "doc-bridge",
  authUid: "fb-bridge",
  aliasIds: ["doc-bridge", "fb-bridge"],
  username: "randomdup",
});
assert.equal(
  dedupe.dedupeShuffleProfiles([liveIncomplete, cacheIncomplete]).length,
  2,
  "incomplete aliases must not join by username/photo",
);
const bridged = dedupe.enrichShuffleIdentitiesFromBridges(
  [liveIncomplete, cacheIncomplete],
  [featuredBridge, followingBridge],
);
assert.equal(bridged.length, 1, "featured/following id bridge must collapse identity");
assert.equal(
  dedupe.assembleVisibleShuffleWindow({
    cache: [cacheIncomplete],
    live: [liveIncomplete],
    featured: [featuredBridge],
    pages: [[row({ uid: "fb-bridge", username: "randomdup", shuffleSource: "page" })]],
  }).length,
  1,
);

assert.equal(fetches, 0);
globalThis.fetch = previousFetch;

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_DEDUPE",
      pass: true,
      coldMs: Number(coldMs.toFixed(3)),
      warmMs: Number(warmMs.toFixed(3)),
      collapsed: collapsed.length,
      pool: n,
      fetches,
      remountsOnRename: 0,
    },
    null,
    2,
  ),
);
