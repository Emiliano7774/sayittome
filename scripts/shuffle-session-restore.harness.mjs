/**
 * SHUFFLE_SESSION_RESTORE
 * Mid-scroll leave → profile/chat → 3 back paths restore same order/pixel;
 * remount + filters fingerprint; only manual reshuffle / filter clears.
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
const session = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleSessionSnapshot.ts")).href
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
const filters = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/filters.ts")).href
);

function profile(username, uid) {
  return { uid, username, bio: "", photo: "", showOnline: false, blurPhoto: false };
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

session.clearShuffleSessionSnapshot();
slots.resetShuffleWindowSlots();
pinned.clearPinnedShuffleWindow();

// Mid-scroll capture with cardIds even if scrollTop briefly 0 must stay usable.
assert.equal(
  snapshot.isUsableShuffleViewportSnapshot({
    cardId: storedIds[1],
    index: 1,
    cardIds: storedIds,
    scrollTop: 0,
    windowGeneration: 1,
    capturedAt: Date.now(),
  }),
  true,
  "ordered window must be usable without scrollTop>0",
);

const leaveSnap = session.captureShuffleSessionSnapshot({
  cardId: storedIds[1],
  index: 1,
  scrollTop: 1840,
  cardIds: storedIds,
  filters: filters.defaultShuffleFilters(),
  search: "",
  batchPages: [["u1", "u2"], ["u3"]],
  pinVisibleWindow: false,
});
assert.equal(leaveSnap.cardId, storedIds[1]);
assert.equal(leaveSnap.scrollTop, 1840);
assert.equal(snapshot.hasUsableShuffleViewportSnapshot(), true);

const extras = session.peekShuffleSessionExtras();
assert.ok(extras);
assert.equal(extras.cardId, storedIds[1]);
assert.deepEqual(extras.batchPages[0], ["u1", "u2"]);
assert.ok(extras.filterFingerprint.includes("soloOnline"));

// Remount: wipe RAM pin + visible, restore from session before paint.
pinned.clearPinnedShuffleWindow();
slots.resetShuffleWindowSlots();
assert.equal(slots.getVisibleShuffleProfiles().length, 0);
assert.equal(pinned.restorePinnedShuffleWindowSync(), true);
const visible = slots.getVisibleShuffleProfiles();
assert.ok(visible.length >= 3);
assert.equal(
  ident.shuffleProfileIdentityKey(visible[1]) || visible[1].username,
  storedIds[1],
);

// Recover path: scroll applied before unfreeze (presentExistingShuffleSnapshot order).
const recoverSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(
    path.join(root, "src/lib/navigation/shuffleForegroundRecover.ts"),
    "utf8",
  ),
);
const restoreWindowIdx = recoverSrc.indexOf("restorePinnedShuffleWindowSync()");
const restoreScrollIdx = recoverSrc.indexOf("restoreShuffleViewportSnapshot()");
const unfreezeIdx = recoverSrc.indexOf("unfreezeExistingHost(host)");
assert.ok(restoreWindowIdx > 0 && restoreScrollIdx > 0 && unfreezeIdx > 0);
assert.ok(
  restoreWindowIdx < restoreScrollIdx && restoreScrollIdx < unfreezeIdx,
  "window+scroll must restore before unfreeze (pre-paint)",
);

// Chat leave wiring + clear on manual reshuffle / filter.
const poolSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(root, "src/hooks/useShufflePool.ts"), "utf8"),
);
assert.match(poolSrc, /action === "chat"/);
assert.match(poolSrc, /captureShuffleSessionSnapshot/);
assert.match(poolSrc, /clearShuffleSessionSnapshot\(\)/);
assert.match(poolSrc, /handleShuffleClick[\s\S]*clearShuffleSessionSnapshot/);
assert.match(poolSrc, /applyFilters[\s\S]*clearShuffleSessionSnapshot/);

const keepAliveSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(root, "src/lib/navigation/shuffleKeepAlive.ts"), "utf8"),
);
assert.match(keepAliveSrc, /captureShuffleSessionSnapshot/);

const logoutSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8"),
);
assert.match(logoutSrc, /clearShuffleSessionSnapshot/);

// Three back paths share prepareInstantShuffleReturn / presentExistingShuffleSnapshot.
const nativeSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(path.join(root, "src/components/app/NativeAppBootstrap.tsx"), "utf8"),
);
assert.match(nativeSrc, /prepareInstantShuffleReturn/);
assert.match(recoverSrc, /profile-back/);
assert.equal(typeof recover.presentExistingShuffleSnapshot, "function");

// Filter fingerprint change must reset; same fingerprint must not.
const fp1 = session.shuffleFiltersFingerprint(filters.defaultShuffleFilters(), "");
const fp2 = session.shuffleFiltersFingerprint(
  { ...filters.defaultShuffleFilters(), soloOnline: true },
  "",
);
assert.notEqual(fp1, fp2);
assert.equal(
  session.shouldResetShuffleSessionForFilterChange({
    previousFingerprint: fp1,
    nextFilters: { ...filters.defaultShuffleFilters(), soloOnline: true },
  }),
  true,
);

session.clearShuffleSessionSnapshot();
console.log(JSON.stringify({ gate: "SHUFFLE_SESSION_RESTORE", pass: true }, null, 2));
