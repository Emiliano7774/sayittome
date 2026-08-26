/**
 * FAKE_PROFILE_TAG_REHYDRATE — mark → stale cache/slot rehydrate must keep PERFIL FALSO.
 *   node --experimental-strip-types scripts/fake-profile-tag-rehydrate.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const overlay = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleAdminTagOverlay.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClientCache.ts")).href
);
const dedupe = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/dedupeProfiles.ts")).href
);
const slots = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleSlotsStore.ts")).href
);
const blur = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/resolveShuffleBlur.ts")).href
);
const profileCache = await import(
  pathToFileURL(path.join(root, "src/lib/profile/profileCache.ts")).href
);

const UID = "fb-fake-demo";
const USERNAME = "fake_demo";

function row(partial) {
  return {
    uid: UID,
    username: USERNAME,
    photo: "https://cdn.example.com/fake.jpg",
    bio: "demo",
    blurPhoto: false,
    showOnline: false,
    moderationTag: "roleplay",
    fakeProfileTag: "",
    ...partial,
  };
}

// 1) Admin marks fake — overlay + pool cache persist the tag.
overlay.setShuffleAdminTagOverlay(UID, { fakeProfileTag: "fake" });
const tagged = overlay.applyShuffleAdminTagOverlay(row({ fakeProfileTag: "fake" }));
cache.writeCachedShufflePool([tagged]);
profileCache.setCachedFullProfile(USERNAME, tagged, { source: "api" });

// 2) Tab leave/return: stale shuffle pool payload missing fakeProfileTag (pre-server refresh).
const stalePoolPayload = row({ fakeProfileTag: "" });
const rehydratedPool = dedupe.overlayShuffleProfileSnapshots(
  cache.readCachedShufflePool(),
  [stalePoolPayload],
);
assert.equal(rehydratedPool.length, 1);
assert.equal(
  rehydratedPool[0].fakeProfileTag,
  "fake",
  "overlay must restore fake tag after stale live overlay",
);
assert.equal(
  rehydratedPool[0].moderationTag,
  "roleplay",
  "roleplay tag must survive fake overlay rehydrate",
);

// 3) Slot window merge must not wipe the badge on presence refresh.
slots.resetShuffleWindowSlots();
slots.setShuffleSlotsWithFeatured([], [tagged], Int32Array.from([0]), 1, true);
slots.flushShuffleSlotsSync();
assert.equal(slots.getVisibleShuffleProfiles()[0].fakeProfileTag, "fake");

const staleRefresh = row({ fakeProfileTag: "", showOnline: true, presenceAt: "2026-08-26T12:00:00.000Z" });
slots.setShuffleSlots([staleRefresh], Int32Array.from([0]), 1);
slots.flushShuffleSlotsSync();
assert.equal(
  slots.getVisibleShuffleProfiles()[0].fakeProfileTag,
  "fake",
  "setShuffleSlots identity merge must preserve fakeProfileTag",
);

// 4) Profile full cache rehydrate after remount.
const cachedProfile = profileCache.getCachedFullProfile(USERNAME);
assert.equal(cachedProfile?.fakeProfileTag, "fake");
assert.equal(cachedProfile?.moderationTag, "roleplay");

// 5) loadProfiles-style merge from incomplete API row keeps sticky tags.
const apiRow = row({ fakeProfileTag: "", moderationTag: "" });
const merged = blur.mergeShuffleProfileModeration(apiRow, tagged);
assert.equal(merged.fakeProfileTag, "fake");
assert.equal(merged.moderationTag, "roleplay");

// 6) Explicit clear propagates through overlay + slots.
overlay.setShuffleAdminTagOverlay(UID, { fakeProfileTag: "" });
profileCache.patchCachedFullProfileAdminTags(USERNAME, { fakeProfileTag: "" });
const cleared = overlay.applyShuffleAdminTagOverlay(row({ fakeProfileTag: "" }));
cache.writeCachedShufflePool([cleared]);
slots.patchShuffleProfileFakeTag(UID, "");
slots.flushShuffleSlotsSync();
assert.equal(slots.getVisibleShuffleProfiles()[0].fakeProfileTag, "");
assert.equal(profileCache.getCachedFullProfile(USERNAME)?.fakeProfileTag, "");

console.log("PASS fake-profile-tag-rehydrate");
