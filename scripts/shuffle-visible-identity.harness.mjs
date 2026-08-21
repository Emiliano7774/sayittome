/**
 * FINAL visible Shuffle list: one real identity everywhere, anons never collapse.
 * Imports productive modules (dedupe, slots, cache, normalize, following chrome).
 * Usage: node --experimental-strip-types scripts/shuffle-visible-identity.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}
if (typeof globalThis.cancelAnimationFrame !== "function") {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

const dedupe = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/dedupeProfiles.ts")).href
);
const slots = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleSlotsStore.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClientCache.ts")).href
);
const chrome = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleChromeCache.ts")).href
);
const follow = await import(
  pathToFileURL(path.join(root, "src/lib/profile/followTargetUid.ts")).href
);
const actions = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleActionTargets.ts")).href
);
const normalize = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/normalize.ts")).href
);

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

function visibleCanonicalKeys(list) {
  return list.map((profile) => dedupe.shuffleProfileIdentityKey(profile)).filter(Boolean);
}

function assertUniqueVisible(list, label) {
  const keys = visibleCanonicalKeys(list);
  const unique = new Set(keys);
  assert.equal(
    unique.size,
    keys.length,
    `${label}: duplicate canonical identity in visible list: ${keys.join(",")}`,
  );
  return unique;
}

const photoAda = "https://cdn.example.com/users/ada-avatar.jpg";
const photoBea = "https://cdn.example.com/users/bea-avatar.jpg";

const docAda = row({
  uid: "doc-ada",
  username: "Ada",
  photo: photoAda,
  shuffleSource: "cache",
});
const fbAda = row({
  uid: "fb-ada",
  authUid: "fb-ada",
  username: "Ada2",
  photo: photoAda,
  bio: "hola",
  shuffleSource: "live",
});
const bridgeAda = row({
  uid: "doc-ada",
  authUid: "fb-ada",
  username: "Ada",
  profileUid: "profile-ada",
  ownerUid: "owner-ada",
  firebaseUid: "fb-ada",
  shuffleSource: "page",
});
const featuredAda = row({
  uid: "doc-ada",
  username: "Ada",
  photo: photoAda,
  shuffleFeatured: true,
  shuffleSource: "featured",
});
const bea = row({
  uid: "fb-bea",
  authUid: "fb-bea",
  username: "Bea",
  photo: photoBea,
  shuffleSource: "live",
});
const anon1 = row({ uid: "anon_sess_1", username: "Guest", photo: photoAda });
const anon2 = row({ uid: "anon_sess_2", username: "Guest", photo: photoAda });

const mergedPerson = dedupe.dedupeShuffleProfiles([docAda, fbAda, bridgeAda]);
assert.equal(mergedPerson.length, 1, "union-find with bridge must collapse to 1");

const visibleAfterAliasLoss = dedupe.uniqueShuffleWindow([featuredAda, ...mergedPerson]);
assert.equal(
  visibleAfterAliasLoss.length,
  1,
  `featured docId + merged authUid must stay 1 identity, got ${visibleAfterAliasLoss.length}`,
);

const page1 = dedupe.dedupeShuffleProfiles([docAda, bea]);
const page2 = dedupe.dedupeShuffleProfiles([fbAda]);
const page3 = dedupe.dedupeShuffleProfiles([bridgeAda]);
const outOfOrder = dedupe.mergeShuffleProfileSnapshots(page2, page1, page3);
assert.equal(
  outOfOrder.filter((p) => !String(p.uid).includes("bea") && p.username !== "Bea").length,
  1,
  "out-of-order pages + bridge must yield one Ada",
);
assert.equal(
  outOfOrder.filter((p) => p.username === "Bea" || p.uid === "fb-bea").length,
  1,
);

const assembled = dedupe.assembleVisibleShuffleWindow({
  cache: [docAda, bea],
  live: [fbAda, bea],
  featured: [featuredAda],
  pages: [[docAda], [fbAda, bea], [bridgeAda]],
});
assertUniqueVisible(assembled, "assemble cache+live+featured+pages");
assert.equal(
  assembled.filter((p) => dedupe.shuffleProfilesShareIdentity(p, docAda)).length,
  1,
);
assert.equal(
  assembled.filter((p) => dedupe.shuffleProfilesShareIdentity(p, bea)).length,
  1,
);
assert.equal(assembled.some((p) => p.shuffleFeatured), true);

slots.resetShuffleWindowSlots();
const pool = assembled.filter((p) => !p.shuffleFeatured);
const featured = assembled.filter((p) => p.shuffleFeatured);
const indices = new Int32Array(pool.map((_, i) => i));
slots.setShuffleSlotsWithFeatured(featured, pool, indices, pool.length, true);
slots.flushShuffleSlotsSync();
const painted = slots.getVisibleShuffleProfiles();
assertUniqueVisible(painted, "slots getVisible");
assert.equal(
  painted.filter((p) => dedupe.shuffleProfilesShareIdentity(p, docAda)).length,
  1,
  "painted feed must not duplicate Ada",
);

const anons = dedupe.assembleVisibleShuffleWindow({
  live: [anon1, anon2, bea],
  featured: [],
  pages: [[anon1], [anon2]],
});
assert.equal(
  anons.filter((p) => dedupe.isAnonShuffleProfile(p)).length,
  2,
  "distinct anon sessions must never collapse",
);

const photoOnly = dedupe.dedupeShuffleProfiles([
  row({ uid: "legacy-1", username: "SameName", photo: photoAda }),
  row({ uid: "legacy-2", username: "SameName", photo: photoAda }),
]);
assert.equal(
  photoOnly.length,
  2,
  "photo+name without uid/email/auth proof must not hide a legitimate profile",
);

const renamedIds = normalize.normalizeShuffleProfiles([
  {
    id: "doc-ada",
    uid: "fb-ada",
    authUid: "fb-ada",
    username: "Ada",
    fotoPrincipal: photoAda,
  },
  {
    id: "fb-ada",
    uid: "fb-ada",
    username: "Ada2",
    photoURL: photoAda,
  },
]);
assert.equal(renamedIds.length, 1, "normalize must union docId with firebaseUid");

cache.writeCachedShufflePool(assembled);
const warm = cache.readCachedShufflePool();
assertUniqueVisible(warm || [], "cache roundtrip");
assert.match(cache.SHUFFLE_POOL_KEY, /v16$/);
assert.equal(dedupe.SHUFFLE_DEDUPE_VERSION, 16);

chrome.writeCachedFollowingSnapshot(
  "viewer",
  [
    { uid: "doc-ada", authUid: "fb-ada", username: "Ada", photo: photoAda, showOnline: false },
    { uid: "fb-ada", username: "Ada2", photo: photoAda, showOnline: true },
  ],
  true,
);
const following = chrome.readCachedFollowingSnapshot("viewer");
assert.equal(following?.profiles.length, 1, "following strip must use the same identity graph");

const actionWinner = row({
  uid: "doc-ada",
  authUid: "fb-ada",
  username: "Ada",
  photo: photoAda,
  fotos: [photoAda, photoAda, photoAda, photoAda],
  bio: "full",
  shuffleSource: "cache",
});
const actionAlias = row({
  uid: "fb-ada",
  authUid: "fb-ada",
  username: "Ada2",
  shuffleSource: "live",
});
const actionMerged = dedupe.dedupeShuffleProfiles([actionWinner, actionAlias]);
assert.equal(actionMerged.length, 1);
assert.equal(actionMerged[0].uid, "doc-ada", "winner uid must stay actionable, not rewritten to authUid");
const cardTargets = actions.shuffleCardActionTargets(actionMerged[0]);
assert.equal(cardTargets.followTargetUid, "doc-ada");
assert.equal(cardTargets.storyOwnerUid, "doc-ada");
assert.equal(
  follow.resolveFollowButtonTargetUid(cardTargets.followTargetUid),
  "doc-ada",
);
assert.equal(follow.buildFollowId("viewer", cardTargets.followTargetUid), "viewer_doc-ada");
assert.equal(
  actions.storyOwnerUidFromShuffleCard(actionMerged[0]),
  cardTargets.storyOwnerUid,
);
assert.equal(actions.shuffleProfileMatchesBoostUid(actionMerged[0], "fb-ada"), true);
assert.equal(actions.shuffleProfileMatchesBoostUid(actionMerged[0], "doc-ada"), true);
assert.ok(cardTargets.boostLookupUids.includes("fb-ada"));
assert.ok(cardTargets.boostLookupUids.includes("doc-ada"));

const cacheA = [docAda, bea];
const liveB = [fbAda, bea];
const featuredC = [featuredAda, bridgeAda];
const graphOrders = [
  [cacheA, liveB, featuredC],
  [featuredC, liveB, cacheA],
  [liveB, cacheA, featuredC],
  [featuredC, cacheA, liveB],
  [cacheA, featuredC, liveB],
  [liveB, featuredC, cacheA],
];
const recencyStamp = (offset) =>
  new Date(Date.parse("2026-08-21T12:00:00.000Z") + offset).toISOString();
const graphKeys = [];
for (const [left, mid, right] of graphOrders) {
  const withRecency = [
    left.map((p, i) => ({ ...p, presenceAt: recencyStamp(i * 1000) })),
    mid.map((p, i) => ({ ...p, presenceAt: recencyStamp(i * 2000 + 50) })),
    right.map((p, i) => ({ ...p, presenceAt: recencyStamp(i * 3000 + 9) })),
  ];
  const merged = dedupe.mergeShuffleProfileSnapshots(...withRecency);
  graphKeys.push(
    merged.map((p) => dedupe.shuffleProfileIdentityKey(p)).sort().join("|"),
  );
}
assert.equal(
  new Set(graphKeys).size,
  1,
  `permutation/recency must keep the same React keys, got ${graphKeys.join(" || ")}`,
);

let restored = dedupe.assembleVisibleShuffleWindow({ cache: cacheA });
const keyAfterCache = restored
  .filter((p) => actions.shuffleProfileMatchesBoostUid(p, "doc-ada") || p.username.startsWith("Ada"))
  .map((p) => dedupe.shuffleProfileIdentityKey(p))[0];
restored = dedupe.assembleVisibleShuffleWindow({ cache: restored, live: liveB });
restored = dedupe.assembleVisibleShuffleWindow({ cache: restored, featured: featuredC });
const keyAfterFeatured = restored
  .filter((p) => actions.shuffleProfileMatchesBoostUid(p, "doc-ada"))
  .map((p) => dedupe.shuffleProfileIdentityKey(p))[0];
const afterRestore = dedupe.assembleVisibleShuffleWindow({
  cache: restored,
  live: cacheA,
});
const keyAfterRestore = afterRestore
  .filter((p) => actions.shuffleProfileMatchesBoostUid(p, "doc-ada"))
  .map((p) => dedupe.shuffleProfileIdentityKey(p))[0];
assert.equal(keyAfterFeatured, keyAfterRestore, "restored cache must not change React identity key");
assert.ok(keyAfterFeatured);
assert.notEqual(keyAfterCache, "", "cache A must have a visual key");

slots.resetShuffleWindowSlots();
const stablePool = restored.filter((p) => !p.shuffleFeatured);
const stableFeatured = restored.filter((p) => p.shuffleFeatured);
const stableIndices = new Int32Array(stablePool.map((_, i) => i));
slots.setShuffleSlotsWithFeatured(stableFeatured, stablePool, stableIndices, stablePool.length, true);
slots.flushShuffleSlotsSync();
const paintedKeys1 = slots.getVisibleShuffleProfiles().map((p) => dedupe.shuffleProfileIdentityKey(p));
slots.setShuffleSlotsWithFeatured(stableFeatured, stablePool, stableIndices, stablePool.length, true);
slots.flushShuffleSlotsSync();
const paintedKeys2 = slots.getVisibleShuffleProfiles().map((p) => dedupe.shuffleProfileIdentityKey(p));
assert.deepEqual(paintedKeys1, paintedKeys2, "forceReplace refresh must keep React keys");

const debug = dedupe.describeShuffleIdentityDebug(assembled[0]);
assert.equal(typeof debug.canonicalHash, "string");
assert.match(debug.canonicalHash, /^[0-9a-f]+$/);
assert.equal("canonical" in debug, false);
assert.equal("username" in debug, false);
assert.equal("email" in debug, false);
assert.equal("photo" in debug, false);
assert.equal("uid" in debug, false);
const debugJson = JSON.stringify(debug);
assert.equal(debugJson.includes("doc-ada"), false, "qaDebug must not leak doc uid");
assert.equal(debugJson.includes("fb-ada"), false, "qaDebug must not leak auth uid");
assert.equal(debugJson.includes("Ada"), false, "qaDebug must not leak username");

function randomId(rng, prefix) {
  return `${prefix}-${Math.floor(rng() * 1e9).toString(36)}`;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

let stressMax = 0;
for (let round = 0; round < 1000; round += 1) {
  const rng = mulberry32(round * 997 + 13);
  const people = 4 + Math.floor(rng() * 8);
  const identities = [];
  const rows = [];
  for (let p = 0; p < people; p += 1) {
    const auth = randomId(rng, "fb");
    const doc = randomId(rng, "doc");
    identities.push(auth);
    const aliases = rng() > 0.4 ? 2 : 1;
    rows.push(
      row({
        uid: doc,
        authUid: aliases > 1 ? auth : "",
        username: `user${p}`,
        photo: rng() > 0.5 ? `https://cdn.example.com/${p}.jpg` : "",
        shuffleSource: "page",
      }),
    );
    if (aliases > 1) {
      rows.push(
        row({
          uid: auth,
          authUid: auth,
          username: `user${p}_b`,
          firebaseUid: auth,
          shuffleSource: "live",
        }),
      );
      if (rng() > 0.5) {
        rows.push(
          row({
            uid: doc,
            authUid: auth,
            username: `user${p}`,
            shuffleSource: "cache",
          }),
        );
      }
    }
  }
  rows.push(row({ uid: `anon_s_${round}_a`, username: "Guest" }));
  rows.push(row({ uid: `anon_s_${round}_b`, username: "Guest" }));

  const shuffled = [...rows].sort(() => rng() - 0.5);
  const mid = Math.ceil(shuffled.length / 2);
  const visible = dedupe.assembleVisibleShuffleWindow({
    cache: shuffled.slice(0, Math.floor(mid / 2)),
    live: shuffled.slice(Math.floor(mid / 2), mid),
    featured: shuffled.slice(0, 1).map((p) => ({ ...p, shuffleFeatured: true })),
    pages: [shuffled.slice(mid), shuffled],
  });
  assertUniqueVisible(visible, `stress round ${round}`);
  const anonsVisible = visible.filter((p) => dedupe.isAnonShuffleProfile(p));
  assert.ok(anonsVisible.length <= 2);
  const anonKeys = new Set(anonsVisible.map((p) => p.uid));
  assert.equal(anonKeys.size, anonsVisible.length);
  stressMax = Math.max(stressMax, visible.length);
}

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_VISIBLE_IDENTITY",
      pass: true,
      version: dedupe.SHUFFLE_DEDUPE_VERSION,
      stressRounds: 1000,
      stressMaxVisible: stressMax,
    },
    null,
    2,
  ),
);
