/**
 * Classic shuffle chrome: durable cache + reserved geometry + CLS 0 post-commit.
 * Usage: node --experimental-strip-types scripts/shuffle-stable-frame.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const { CLASSIC_SHUFFLE_DENSITY_OPTIONS } = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/classicDensity.ts")).href
);
const headerUi = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/classicHeaderUi.ts")).href
);
const chrome = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleChromeCache.ts")).href
);
const stable = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleChromeStable.ts")).href
);

const profile = {
  uid: "p1",
  username: "ada",
  photo: "",
  showOnline: false,
};

const pendingUnknownAnon = {
  authPending: true,
  uid: "",
  cached: null,
  hasActiveDirectChat: false,
  isProfileUser: false,
  isIncognitoVisitor: false,
  searching: false,
};

function assertZeroDomShift(before, after, label) {
  assert.equal(before.feedOffsetPx, after.feedOffsetPx, label);
  assert.equal(before.anon.layoutPx, after.anon.layoutPx, `${label} anon`);
  assert.equal(before.following.layoutPx, after.following.layoutPx, `${label} following`);
  assert.equal(before.anon.offsetHeight, after.anon.offsetHeight, `${label} anon offsetHeight`);
}

chrome.clearShuffleChromeCache();

const emptyPending = stable.decideFollowingChrome({
  authPending: true,
  uid: "",
  cached: null,
  liveProfiles: null,
  liveReady: false,
});
assert.equal(emptyPending.showGuest, false);
assert.equal(emptyPending.state, "skeleton");
assert.equal(emptyPending.profiles.length, 0);

const guestFollowing = stable.decideFollowingChrome({
  authPending: false,
  uid: "",
  cached: null,
  liveProfiles: null,
  liveReady: true,
});
assert.equal(guestFollowing.state, "guest");

chrome.writeCachedFollowingSnapshot("uidA", [profile], true);
assert.equal(chrome.readCachedFollowingSnapshot(""), null);

const leaked = stable.decideFollowingChrome({
  authPending: true,
  uid: "",
  cached: {
    version: 1,
    uid: "uidA",
    profiles: [profile],
    hasSession: true,
  },
  liveProfiles: null,
  liveReady: false,
});
assert.equal(leaked.profiles.length, 0, "never flash another account when uid is unknown");
assert.equal(leaked.state, "skeleton");

const mismatch = stable.decideFollowingChrome({
  authPending: true,
  uid: "uidB",
  cached: chrome.readCachedFollowingSnapshot("uidA"),
  liveProfiles: null,
  liveReady: false,
});
assert.equal(mismatch.profiles.length, 0);

const scopedWarm = stable.decideFollowingChrome({
  authPending: true,
  uid: "uidA",
  cached: chrome.readCachedFollowingSnapshot("uidA"),
  liveProfiles: null,
  liveReady: false,
});
assert.equal(scopedWarm.state, "rows");
assert.equal(scopedWarm.profiles[0].username, "ada");

chrome.resetShuffleChromeRamCache();
assert.equal(chrome.readCachedFollowingSnapshot("uidA")?.profiles[0].uid, "p1");
assert.equal(chrome.readCachedFollowingSnapshot("uidB"), null);

const liveRows = stable.decideFollowingChrome({
  authPending: false,
  uid: "uidA",
  cached: chrome.readCachedFollowingSnapshot("uidA"),
  liveProfiles: [profile],
  liveReady: true,
});
assert.equal(liveRows.state, "rows");

const emptySession = stable.decideFollowingChrome({
  authPending: false,
  uid: "uidA",
  cached: { version: 1, uid: "uidA", profiles: [], hasSession: true },
  liveProfiles: [],
  liveReady: true,
});
assert.equal(emptySession.state, "empty");

chrome.writeCachedFollowingSnapshot("", [], false);
assert.equal(chrome.readCachedFollowingSnapshot("uidA"), null);

window.sessionStorage.setItem(
  chrome.SHUFFLE_FOLLOWING_CACHE_KEY,
  JSON.stringify({
    savedAt: Date.now() - chrome.SHUFFLE_CHROME_TTL_MS - 10,
    value: {
      version: chrome.SHUFFLE_CHROME_CACHE_VERSION,
      uid: "uidA",
      profiles: [profile],
      hasSession: true,
    },
  }),
);
chrome.resetShuffleChromeRamCache();
assert.equal(chrome.readCachedFollowingSnapshot("uidA"), null);

window.sessionStorage.setItem(
  chrome.SHUFFLE_FOLLOWING_CACHE_KEY,
  JSON.stringify({
    savedAt: Date.now(),
    value: { version: 0, uid: "uidA", profiles: [profile], hasSession: true },
  }),
);
chrome.resetShuffleChromeRamCache();
assert.equal(chrome.readCachedFollowingSnapshot("uidA"), null);

const pendingUnknown = stable.decideAnonCardChrome(pendingUnknownAnon);
assert.equal(pendingUnknown.visibility, "reserved");
assert.notEqual(pendingUnknown.visibility, "hidden");

const profileShow = stable.decideAnonCardChrome({
  authPending: false,
  uid: "uidA",
  cached: null,
  hasActiveDirectChat: false,
  isProfileUser: true,
  isIncognitoVisitor: false,
  searching: false,
});
assert.equal(profileShow.visibility, "show");

const guestAnon = stable.decideAnonCardChrome({
  authPending: false,
  uid: "",
  cached: null,
  hasActiveDirectChat: false,
  isProfileUser: false,
  isIncognitoVisitor: false,
  searching: false,
});
assert.equal(guestAnon.visibility, "hidden");

const activeChat = stable.decideAnonCardChrome({
  authPending: false,
  uid: "uidA",
  cached: null,
  hasActiveDirectChat: true,
  isProfileUser: true,
  isIncognitoVisitor: false,
  searching: false,
});
assert.equal(activeChat.hiddenForActiveChat, true);

const cachedChatHide = stable.decideAnonCardChrome({
  authPending: true,
  uid: "uidA",
  cached: {
    version: 1,
    uid: "uidA",
    show: false,
    hiddenForActiveChat: true,
    isIncognitoVisitor: false,
    isProfileUser: true,
    searching: false,
  },
  hasActiveDirectChat: false,
  isProfileUser: true,
  isIncognitoVisitor: false,
  searching: false,
});
assert.equal(cachedChatHide.visibility, "hidden");
const warmHideMount = stable.createShuffleChromeMount(20).paint({
  authPending: true,
  following: scopedWarm,
  anon: cachedChatHide,
});
assert.equal(warmHideMount.anon.layoutPx, 0);

const unscopedAnon = stable.decideAnonCardChrome({
  authPending: true,
  uid: "",
  cached: {
    version: 1,
    uid: "uidA",
    show: true,
    hiddenForActiveChat: false,
    isIncognitoVisitor: false,
    isProfileUser: true,
    searching: true,
  },
  hasActiveDirectChat: false,
  isProfileUser: false,
  isIncognitoVisitor: false,
  searching: false,
});
assert.equal(unscopedAnon.visibility, "reserved");
assert.equal(unscopedAnon.searching, false);

for (const density of CLASSIC_SHUFFLE_DENSITY_OPTIONS) {
  const ui = headerUi.getClassicShuffleHeaderUi(density);
  const followingStyles = stable.classicFollowingSlotStyles(ui);
  const followingDom = stable.measureSlotBox(followingStyles);
  const anonStyles = stable.classicAnonSlotStyles(ui, true);
  const anonDom = stable.measureSlotBox(anonStyles);
  const collapsed = stable.measureSlotBox(stable.classicAnonSlotStyles(ui, false));

  assert.equal(
    ui.followingSlotPx,
    ui.followingPbPx + 1 + headerUi.classicFollowingInnerPx(ui),
    `density ${density} following slotPx excludes marginTop`,
  );
  assert.equal(
    ui.anonSlotPx,
    ui.anonPtPx + 1 + headerUi.classicAnonInnerPx(ui),
    `density ${density} anon slotPx excludes margins`,
  );
  assert.notEqual(
    ui.followingSlotPx,
    ui.followingMtPx + ui.followingPbPx + 1 + headerUi.classicFollowingInnerPx(ui),
    `density ${density} following slotPx must not duplicate marginTop`,
  );
  assert.notEqual(
    ui.anonSlotPx,
    ui.anonMtPx + ui.anonMbPx + ui.anonPtPx + 1 + headerUi.classicAnonInnerPx(ui),
    `density ${density} anon slotPx must not duplicate margins`,
  );
  assert.equal(followingStyles.minHeight, ui.followingSlotPx);
  assert.equal(followingStyles.marginTop, ui.followingMtPx);
  assert.equal(followingDom.offsetHeight, ui.followingSlotPx);
  assert.equal(followingDom.layoutPx, ui.followingMtPx + ui.followingSlotPx);
  assert.equal(anonStyles.minHeight, ui.anonSlotPx);
  assert.equal(anonStyles.marginTop, ui.anonMtPx);
  assert.equal(anonStyles.marginBottom, ui.anonMbPx);
  assert.equal(anonDom.offsetHeight, ui.anonSlotPx);
  assert.equal(anonDom.layoutPx, ui.anonMtPx + ui.anonSlotPx + ui.anonMbPx);
  assert.equal(collapsed.layoutPx, 0);

  const mount = stable.createShuffleChromeMount(density);
  const pendingFrame = mount.paint({
    authPending: true,
    following: emptyPending,
    anon: pendingUnknown,
  });
  const showFrame = mount.paint({
    authPending: false,
    following: liveRows,
    anon: profileShow,
  });
  assertZeroDomShift(
    pendingFrame,
    showFrame,
    `density ${density} hidden-pending→show DOM CLS`,
  );

  const guestFrame = mount.paint({
    authPending: false,
    following: guestFollowing,
    anon: guestAnon,
  });
  assertZeroDomShift(pendingFrame, guestFrame, `density ${density} pending→guest DOM CLS`);

  const chatFrame = mount.paint({
    authPending: false,
    following: liveRows,
    anon: activeChat,
  });
  assertZeroDomShift(pendingFrame, chatFrame, `density ${density} pending→chat-activo DOM CLS`);

  const coldGuest = stable.createShuffleChromeMount(density).paint({
    authPending: false,
    following: guestFollowing,
    anon: guestAnon,
  });
  assert.equal(coldGuest.anon.layoutPx, 0, `density ${density} new-mount guest can be 0`);
}

chrome.writeCachedAnonCardSnapshot({
  uid: "uidA",
  show: true,
  hiddenForActiveChat: false,
  isIncognitoVisitor: false,
  isProfileUser: true,
  searching: false,
});
chrome.resetShuffleChromeRamCache();
assert.equal(chrome.readCachedAnonCardSnapshot("uidA")?.show, true);
assert.equal(chrome.readCachedAnonCardSnapshot(""), null);
assert.equal(chrome.readCachedAnonCardSnapshot("uidB"), null);

chrome.clearShuffleChromeCache();
assert.equal(chrome.readCachedAnonCardSnapshot("uidA"), null);

const classicCard = fs.readFileSync(
  path.join(root, "src/components/anonMatch/ClassicAnonConnectCard.tsx"),
  "utf8",
);
const followingStrip = fs.readFileSync(
  path.join(root, "src/components/shuffle/ClassicFollowingStrip.tsx"),
  "utf8",
);
const followingHook = fs.readFileSync(
  path.join(root, "src/hooks/useFollowingProfiles.ts"),
  "utf8",
);
const shuffleClient = fs.readFileSync(
  path.join(root, "src/app/shuffle/shuffle-client.tsx"),
  "utf8",
);
const logout = fs.readFileSync(path.join(root, "src/lib/auth/logout.ts"), "utf8");

assert.equal(classicCard.includes("if (authPending && !cached?.show) return null"), false);
assert.equal(classicCard.includes("commitAnonSlotHeight"), true);
assert.equal(classicCard.includes("classicAnonSlotStyles"), true);
assert.equal(classicCard.includes("readCachedAnonCardSnapshot(uid)"), true);
assert.equal(/readCachedAnonCardSnapshot\(\s*\)/.test(classicCard), false);
assert.equal(followingStrip.includes("classicFollowingSlotStyles"), true);
assert.equal(followingHook.includes("uid ? readCachedFollowingSnapshot(uid) : null"), true);
assert.equal(/readCachedFollowingSnapshot\(\s*\)/.test(followingHook), false);
assert.equal(shuffleClient.includes("<ShuffleSlots />"), true);
assert.equal(/<ShuffleSlots\s+key=/.test(shuffleClient), false);
assert.equal(logout.includes("clearShuffleChromeCache"), true);

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_STABLE_FRAME",
      pass: true,
      densities: CLASSIC_SHUFFLE_DENSITY_OPTIONS,
    },
    null,
    2,
  ),
);
