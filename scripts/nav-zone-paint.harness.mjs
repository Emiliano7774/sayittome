/**
 * Cold/warm navigation → useful paint for profile/chat/shuffle caches.
 * Usage: node --experimental-strip-types scripts/nav-zone-paint.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const profileCache = await import(
  pathToFileURL(path.join(root, "src/lib/profile/profileCache.ts")).href
);
const chatCache = await import(
  pathToFileURL(path.join(root, "src/lib/chat/chatMessageCache.ts")).href
);
const shuffleChrome = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleChromeCache.ts")).href
);
const ready = await import(
  pathToFileURL(path.join(root, "src/hooks/useProfileReady.ts")).href
);

function measureSync(label, fn) {
  const start = performance.now();
  const value = fn();
  return { label, ms: performance.now() - start, value };
}

profileCache.clearCachedFullProfile();
const cold = measureSync("profile-cold", () => profileCache.measureProfileCachePaint("maria"));
assert.equal(cold.value.hit, false);
assert.ok(cold.ms < 20, `cold paint lookup too slow: ${cold.ms}`);

profileCache.seedFullProfileFromShuffleCard({
  uid: "uidM",
  username: "maria",
  bio: "hola",
  photo: "https://example.com/m.jpg",
  showOnline: true,
  blurPhoto: false,
});
const seeded = measureSync("profile-seed", () => profileCache.getCachedFullProfile("maria"));
assert.equal(seeded.value, null);
assert.equal(profileCache.isPaintableFullProfileCache("maria"), false);
assert.equal(profileCache.getCachedProfile("maria")?.uid, "uidM");
assert.equal(profileCache.shouldIdleRevalidateFullProfile("maria"), false);
assert.ok(seeded.ms < 20, `sync seed too slow: ${seeded.ms}`);

profileCache.setCachedFullProfile("maria", { uid: "uidM", username: "maria", likes: 3, seguidores: 2 }, { source: "api" });
const warm = measureSync("profile-warm", () => profileCache.measureProfileCachePaint("maria"));
assert.equal(warm.value.hit, true);
assert.equal(warm.value.fresh, true);
assert.equal(profileCache.isPaintableFullProfileCache("maria"), true);
assert.equal(profileCache.shouldIdleRevalidateFullProfile("maria"), false);
assert.ok(warm.ms < 20, `warm paint too slow: ${warm.ms}`);

const staleAt = Date.now() + profileCache.PROFILE_CACHE_TTL_MS + 1;
assert.equal(profileCache.isFullProfileCacheFresh("maria", staleAt), false);
assert.equal(profileCache.measureProfileCachePaint("maria", staleAt).stale, true);
assert.equal(ready.shouldShowProfileLoading({ loading: true, hasProfile: true }), false);

chatCache.writeCachedChatMessages("c1", [{ id: "m1", text: "hola" }]);
const chatWarm = measureSync("chat-warm", () => chatCache.readCachedChatMessages("c1"));
assert.equal(chatWarm.value?.[0]?.id, "m1");
assert.ok(chatWarm.ms < 20);

shuffleChrome.writeCachedFollowingSnapshot("uidM", [], true);
const followingWarm = measureSync("shuffle-following", () =>
  shuffleChrome.readCachedFollowingSnapshot("uidM"),
);
assert.equal(followingWarm.value?.uid, "uidM");
assert.ok(followingWarm.ms < 20);

profileCache.clearCachedFullProfile();
const now = Date.now();
for (let i = 0; i < profileCache.PROFILE_FULL_CACHE_MAX + 3; i += 1) {
  profileCache.setCachedFullProfile(`u${i}`, { uid: `u${i}`, likes: i }, { source: "api", fetchedAt: now - (profileCache.PROFILE_FULL_CACHE_MAX + 3 - i) * 1000 });
}
assert.equal(profileCache.getCachedFullProfile("u0"), null);
assert.equal(profileCache.getCachedFullProfile("u1"), null);
assert.equal(profileCache.getCachedFullProfile("u2"), null);
assert.equal(profileCache.getCachedFullProfile(`u${profileCache.PROFILE_FULL_CACHE_MAX + 2}`)?.uid, `u${profileCache.PROFILE_FULL_CACHE_MAX + 2}`);

profileCache.setCachedFullProfile("partial", { uid: "p", username: "partial" }, { source: "shuffle-seed" });
assert.equal(profileCache.isPaintableFullProfileCache("partial"), false);
assert.equal(profileCache.getCachedFullProfile("partial"), null);
assert.equal(profileCache.getCachedFullProfile("partial", { allowPartial: true })?.uid, "p");

const regressionBudget = {
  cold: 20,
  warm: 20,
};
assert.ok(cold.ms < regressionBudget.cold);
assert.ok(warm.ms < regressionBudget.warm);
assert.ok(chatWarm.ms < regressionBudget.warm);
assert.ok(followingWarm.ms < regressionBudget.warm);

console.log(
  JSON.stringify(
    {
      gate: "NAV_ZONE_PAINT",
      pass: true,
      coldMs: Number(cold.ms.toFixed(3)),
      warmMs: Number(warm.ms.toFixed(3)),
      chatWarmMs: Number(chatWarm.ms.toFixed(3)),
      followingWarmMs: Number(followingWarm.ms.toFixed(3)),
    },
    null,
    2,
  ),
);
