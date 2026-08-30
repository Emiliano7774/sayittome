/**
 * SHUFFLE_BACK_SCROLL_RESTORE — unit/stub only (plain objects + globalThis.document).
 * NOT physical browser PASS. Exercises real entrypoints (fastRouter, native back,
 * chat back helpers) and negative fresh Shuffle entry (no stale snapshot restore).
 *
 * Usage: node --experimental-strip-types scripts/shuffle-back-scroll-restore.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

if (!globalThis.window.history) {
  globalThis.window.history = {
    state: null,
    pushState() {},
    replaceState() {},
  };
}

const scroll = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleFeedScroll.ts")).href
);
const snapshot = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleViewportSnapshot.ts")).href
);
const ident = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/dedupeProfiles.ts")).href
);
const slots = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleSlotsStore.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClientCache.ts")).href
);
const pinned = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shufflePinnedWindow.ts")).href
);
const recover = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleForegroundRecover.ts")).href
);
const keep = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleKeepAlive.ts")).href
);
const fast = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/fastNavigate.ts")).href
);
const handle = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/handleNativeBack.ts")).href
);
const chatBack = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/chatBackNavigation.ts")).href
);
const nativeBack = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/nativeBack.ts")).href
);
const profileReturn = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/profileReturnNav.ts")).href
);
const navStack = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/nativeNavStack.ts")).href
);

const CARD_HEIGHT = 120;
const PROFILE_COUNT = 35;
const CAPTURED_SCROLL = 659;
const WRONG_CLAMP_SCROLL = 120;
const TARGET_USERNAME = "Enzo";

function profile(username, uid) {
  return { uid, username, bio: "", photo: "", showOnline: false, blurPhoto: false };
}

function createMainScroll(initialTop = CAPTURED_SCROLL) {
  return {
    _scrollTop: initialTop,
    clientHeight: 400,
    layoutReady: true,
    get scrollHeight() {
      return this.layoutReady ? PROFILE_COUNT * CARD_HEIGHT + 40 : 400;
    },
    get scrollTop() {
      return this._scrollTop;
    },
    set scrollTop(value) {
      const max = Math.max(0, this.scrollHeight - this.clientHeight);
      this._scrollTop = Math.min(Math.max(0, Number(value) || 0), max);
    },
  };
}

function buildFixture() {
  const rows = Array.from({ length: PROFILE_COUNT }, (_, i) =>
    profile(i === 9 ? TARGET_USERNAME : `user${i}`, `u${i}`),
  );
  cache.writeCachedShufflePool(rows);
  const storedIds = rows.map((row) => ident.shuffleProfileIdentityKey(row) || row.username);
  const enzoCardId = storedIds[9];

  const mainScroll = createMainScroll(CAPTURED_SCROLL);

  const cardNodes = storedIds.map((id, index) => ({
    classList: { contains: (name) => name !== "sayittome-nav-scroll-spacer" },
    getAttribute: (name) => (name === "data-card-id" ? id : null),
    offsetTop: index * CARD_HEIGHT,
    offsetHeight: CARD_HEIGHT,
    offsetWidth: 360,
    childNodes: [1],
    getBoundingClientRect() {
      return {
        width: 360,
        height: CARD_HEIGHT,
        top: index * CARD_HEIGHT - mainScroll.scrollTop,
        left: 0,
        right: 360,
        bottom: index * CARD_HEIGHT - mainScroll.scrollTop + CARD_HEIGHT,
      };
    },
  }));

  const host = {
    classList: {
      names: new Set(["sayittome-shuffle-keepalive-frozen"]),
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
    style: { opacity: "0", visibility: "hidden", pointerEvents: "none" },
    querySelector(sel) {
      const needle = String(sel);
      if (needle.includes("data-shuffle-list")) return { children: cardNodes };
      if (needle.includes("data-scroll-root")) return mainScroll;
      if (needle.includes("shuffle-surface-prep")) return null;
      return null;
    },
    querySelectorAll() {
      return cardNodes;
    },
    hasAttribute() {
      return false;
    },
    setAttribute() {},
    removeAttribute() {},
    getBoundingClientRect() {
      return { width: 390, height: 844, top: 0, left: 0, right: 390, bottom: 844 };
    },
  };

  const htmlClasses = new Set();
  const bodyClasses = new Set();

  globalThis.document = {
    ...globalThis.document,
    activeElement: null,
    documentElement: {
      classList: {
        add(name) {
          htmlClasses.add(name);
        },
        remove(name) {
          htmlClasses.delete(name);
        },
        contains(name) {
          return htmlClasses.has(name);
        },
      },
      style: { removeProperty() {} },
      hasAttribute: () => false,
      getAttribute: () => null,
      setAttribute: () => {},
      removeAttribute: () => {},
    },
    body: {
      classList: {
        add(name) {
          bodyClasses.add(name);
        },
        remove(name) {
          bodyClasses.delete(name);
        },
        contains(name) {
          return bodyClasses.has(name);
        },
      },
      style: {},
    },
    getElementById(id) {
      return id === recover.SHUFFLE_KEEPALIVE_HOST_ID ? host : null;
    },
    querySelector(sel) {
      if (String(sel).includes("data-scroll-root")) return mainScroll;
      return null;
    },
  };

  globalThis.window.location.pathname = "/shuffle";
  globalThis.window.getComputedStyle = () => ({
    display: "block",
    visibility: "visible",
    opacity: "1",
    pointerEvents: "auto",
  });
  globalThis.window.innerHeight = 800;
  globalThis.window.visualViewport = { height: 800 };

  function anchorYForCard(cardId) {
    const index = cardNodes.findIndex((node) => node.getAttribute("data-card-id") === cardId);
    if (index < 0) return 0;
    return cardNodes[index].offsetTop - mainScroll.scrollTop;
  }

  return { rows, storedIds, enzoCardId, mainScroll, host, cardNodes, anchorYForCard };
}

function captureSnapshot(fixture) {
  snapshot.clearShuffleViewportSnapshot();
  snapshot.captureShuffleViewportSnapshot({
    cardId: fixture.enzoCardId,
    index: 9,
    scrollTop: CAPTURED_SCROLL,
    cardIds: fixture.storedIds,
    profiles: fixture.rows,
  });
  pinned.clearPinnedShuffleWindow();
  slots.resetShuffleWindowSlots();
  assert.equal(pinned.restorePinnedShuffleWindowSync(), true);
}

function simulateAwayFromShuffle(fixture, awayPath) {
  fixture.mainScroll.scrollTop = CAPTURED_SCROLL;
  fixture.mainScroll.layoutReady = true;
  scroll.captureShuffleFeedScroll(CAPTURED_SCROLL);
  keep.pinShuffleKeepAlive();
  keep.pinShuffleWindowWhileAway();
  fixture.host.classList.add("sayittome-shuffle-keepalive-frozen");
  fixture.host.classList.remove("sayittome-shuffle-keepalive-visible");
  fixture.host.style.opacity = "0";
  fixture.host.style.visibility = "hidden";
  globalThis.window.location.pathname = awayPath;
}

function simulateBrokenScrollOnReturn(fixture, brokenTop) {
  fixture.mainScroll.scrollTop = brokenTop;
  fixture.mainScroll.layoutReady = true;
  fixture.host.classList.remove("sayittome-shuffle-keepalive-frozen");
  fixture.host.classList.add("sayittome-shuffle-keepalive-visible");
  fixture.host.style.opacity = "1";
  fixture.host.style.visibility = "visible";
  globalThis.window.location.pathname = "/shuffle";
}

function drainRestoreQueue(queue, max = 48) {
  let guard = 0;
  while (queue.length > 0 && guard < max) {
    queue.shift()();
    guard += 1;
  }
}

async function flushAsyncRestores(turns = 24) {
  for (let i = 0; i < turns; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function assertScrollAndAnchor(fixture, beforeAnchorY, label) {
  assert.equal(
    fixture.mainScroll.scrollTop,
    CAPTURED_SCROLL,
    `${label}: MAIN.scrollTop must restore to ${CAPTURED_SCROLL}, got ${fixture.mainScroll.scrollTop}`,
  );
  const afterAnchorY = fixture.anchorYForCard(fixture.enzoCardId);
  assert.ok(
    Math.abs(afterAnchorY - beforeAnchorY) <= 4,
    `${label}: anchor Y must match (${beforeAnchorY} vs ${afterAnchorY})`,
  );
  const visible = slots.getVisibleShuffleProfiles();
  assert.equal(visible.length, PROFILE_COUNT, `${label}: same ${PROFILE_COUNT} profiles`);
  assert.deepEqual(
    visible.map((row) => ident.shuffleProfileIdentityKey(row) || row.username),
    fixture.storedIds,
    `${label}: same order — no reshuffle`,
  );
}

function createMockRouter() {
  const calls = [];
  return {
    calls,
    replace(href) {
      calls.push({ method: "replace", href });
      globalThis.window.location.pathname = String(href).split("?")[0].split("#")[0];
    },
    push(href) {
      calls.push({ method: "push", href });
      globalThis.window.location.pathname = String(href).split("?")[0].split("#")[0];
    },
    back() {
      calls.push({ method: "back" });
    },
  };
}

/** Mirrors NativeAppBootstrap.runNativeBackNavigation shuffle branch. */
function runNativeBackNavigation(router, currentPath) {
  const action = handle.resolveNativeBackNavigation(currentPath);
  if (!action?.navigateTo) return action;
  if (currentPath.startsWith("/u/") && !currentPath.endsWith("/chat")) {
    profileReturn.consumeProfileReturnTo();
  }
  if (keep.isInstantShuffleReturnDestination(action.navigateTo)) {
    keep.prepareInstantShuffleReturn();
    router.replace(action.navigateTo);
    return action;
  }
  if (
    keep.isShuffleKeepAliveActive() &&
    (action.navigateTo.startsWith("/u/") || action.navigateTo === "/shuffle")
  ) {
    keep.pinShuffleWindowWhileAway();
  }
  router.replace(action.navigateTo);
  return action;
}

/** Mirrors ModernPublicProfile / classic profile UI back (click + keyboard). */
function runProfileUiBack(router, returnTo = "/shuffle") {
  keep.prepareInstantShuffleReturn();
  fast.fastRouterReplace(router, returnTo);
}

/** Mirrors ProfileAnonChat.goBackFromChat leave path. */
function runChatUiBack(router, pathname) {
  const backAction = chatBack.resolveChatBackAction(pathname);
  if (backAction?.kind === "dismiss-keyboard") {
    return { dismissedKeyboard: true };
  }
  const dest = nativeBack.resolveChatBackDestination(pathname);
  if (keep.isInstantShuffleReturnDestination(dest)) {
    keep.prepareInstantShuffleReturn();
    router.replace(dest);
    return { navigateTo: dest };
  }
  fast.fastRouterReplace(router, dest);
  return { navigateTo: dest };
}

const results = {};

// --- Negative: fresh Shuffle entry must NOT apply stale session snapshot (run before pin) ---
{
  const fixture = buildFixture();
  snapshot.clearShuffleViewportSnapshot();
  snapshot.captureShuffleViewportSnapshot({
    cardId: fixture.enzoCardId,
    index: 9,
    scrollTop: CAPTURED_SCROLL,
    cardIds: fixture.storedIds,
    profiles: fixture.rows,
  });
  fixture.mainScroll.scrollTop = 0;
  fixture.mainScroll.layoutReady = true;
  assert.equal(keep.isShuffleKeepAliveActive(), false);

  const coldRouter = createMockRouter();
  fast.fastRouterReplace(coldRouter, "/shuffle");
  assert.equal(fixture.mainScroll.scrollTop, 0, "fastRouter cold entry must not restore scroll");

  keep.enterColdShufflePresentation({ force: true });
  assert.equal(
    fixture.mainScroll.scrollTop,
    0,
    "enterColdShufflePresentation without keep-alive must not restore stale snapshot",
  );

  results.fresh_shuffle_no_stale_snapshot = {
    pass: true,
    scrollTop: fixture.mainScroll.scrollTop,
    keepAliveActive: keep.isShuffleKeepAliveActive(),
  };
}

// --- Core restore: layout-not-ready clamps to 0 ---
{
  const fixture = buildFixture();
  captureSnapshot(fixture);
  const beforeAnchorY = fixture.anchorYForCard(fixture.enzoCardId);

  fixture.mainScroll.scrollTop = 0;
  fixture.mainScroll.layoutReady = false;
  const weakQueue = [];
  scroll.restoreShuffleFeedScroll({
    attempts: 4,
    schedule: (cb) => {
      weakQueue.push(cb);
    },
  });
  assert.equal(fixture.mainScroll.scrollTop, 0, "layout-not-ready clamps scroll to 0");
  fixture.mainScroll.layoutReady = true;
  drainRestoreQueue(weakQueue);

  assert.equal(fixture.mainScroll.scrollTop, CAPTURED_SCROLL);
  results.core_layout_zero_retry = {
    pass: true,
    scrollTop: fixture.mainScroll.scrollTop,
    anchorYBefore: beforeAnchorY,
    anchorYAfter: fixture.anchorYForCard(fixture.enzoCardId),
  };
}

// --- Post-layout wrong non-zero clamp (120, not 0) and entrypoint paths ---
await (async () => {
{
  const fixture = buildFixture();
  captureSnapshot(fixture);
  const beforeAnchorY = fixture.anchorYForCard(fixture.enzoCardId);
  simulateAwayFromShuffle(fixture, `/u/${TARGET_USERNAME}`);
  simulateBrokenScrollOnReturn(fixture, WRONG_CLAMP_SCROLL);
  assert.ok(fixture.mainScroll.scrollTop > 4 && fixture.mainScroll.scrollTop < CAPTURED_SCROLL);

  keep.prepareInstantShuffleReturn();
  await flushAsyncRestores();

  assertScrollAndAnchor(fixture, beforeAnchorY, "wrong_nonzero_clamp");
  results.wrong_nonzero_clamp_restore = {
    pass: true,
    brokenScroll: WRONG_CLAMP_SCROLL,
    scrollTopAfter: fixture.mainScroll.scrollTop,
  };
}

// --- Profile back via fastRouter (mouse click path) ---
{
  handle.resetNativeBackNavigationState();
  profileReturn.stashProfileReturnTo("/shuffle");
  const fixture = buildFixture();
  captureSnapshot(fixture);
  const beforeAnchorY = fixture.anchorYForCard(fixture.enzoCardId);
  simulateAwayFromShuffle(fixture, `/u/${TARGET_USERNAME}`);
  simulateBrokenScrollOnReturn(fixture, 0);

  const router = createMockRouter();
  runProfileUiBack(router, "/shuffle");
  assert.equal(router.calls.at(-1)?.href, "/shuffle");
  assert.equal(keep.isInstantShuffleReturnPending(), true);
  await flushAsyncRestores();

  assertScrollAndAnchor(fixture, beforeAnchorY, "profile_back_mouse");
  results.profile_back_mouse = {
    pass: true,
    entrypoint: "prepareInstantShuffleReturn+fastRouterReplace",
    scrollTop: fixture.mainScroll.scrollTop,
  };
}

// --- Profile back keyboard (same handler as click in ModernPublicProfile) ---
{
  profileReturn.stashProfileReturnTo("/shuffle");
  const fixture = buildFixture();
  captureSnapshot(fixture);
  const beforeAnchorY = fixture.anchorYForCard(fixture.enzoCardId);
  simulateAwayFromShuffle(fixture, `/u/${TARGET_USERNAME}`);
  simulateBrokenScrollOnReturn(fixture, 0);

  const router = createMockRouter();
  keep.prepareInstantShuffleReturn();
  fast.fastRouterReplace(router, "/shuffle");
  await flushAsyncRestores();
  assertScrollAndAnchor(fixture, beforeAnchorY, "profile_back_keyboard");
  results.profile_back_keyboard = {
    pass: true,
    entrypoint: "handleProfileBack_keyboard_same_as_click",
    scrollTop: fixture.mainScroll.scrollTop,
  };
}

// --- Native Android back from profile ---
{
  handle.resetNativeBackNavigationState();
  handle.setBackLockMsOverride(0);
  navStack.resetNativeNavStackForTests();
  profileReturn.stashProfileReturnTo("/shuffle");
  const fixture = buildFixture();
  captureSnapshot(fixture);
  const beforeAnchorY = fixture.anchorYForCard(fixture.enzoCardId);
  simulateAwayFromShuffle(fixture, `/u/${TARGET_USERNAME}`);
  simulateBrokenScrollOnReturn(fixture, 0);
  globalThis.window.location.pathname = `/u/${TARGET_USERNAME}`;

  const router = createMockRouter();
  const action = runNativeBackNavigation(router, `/u/${TARGET_USERNAME}`);
  assert.equal(action?.navigateTo, "/shuffle");
  await flushAsyncRestores();
  assertScrollAndAnchor(fixture, beforeAnchorY, "native_android_back_profile");
  results.native_android_back_profile = {
    pass: true,
    entrypoint: "resolveNativeBackNavigation+prepareInstantShuffleReturn",
    scrollTop: fixture.mainScroll.scrollTop,
  };
  handle.setBackLockMsOverride(null);
}

// --- Chat back: keyboard dismiss then navigate (real resolveChatBackAction sequence) ---
{
  handle.resetNativeBackNavigationState();
  handle.setBackLockMsOverride(0);
  navStack.resetNativeNavStackForTests();
  chatBack.resetChatBackNavigationState();
  const fixture = buildFixture();
  captureSnapshot(fixture);
  const beforeAnchorY = fixture.anchorYForCard(fixture.enzoCardId);
  simulateAwayFromShuffle(fixture, "/chat/thread-1");
  navStack.recordNativeNavPath("/shuffle");
  globalThis.window.location.pathname = "/chat/thread-1";
  globalThis.window.visualViewport = { height: 400 };

  const router = createMockRouter();
  chatBack.resetChatBackNavigationState();
  globalThis.window.visualViewport = { height: 400 };
  const dismissNative = handle.resolveNativeBackNavigation("/chat/thread-1");
  assert.deepEqual(dismissNative, {});
  assert.equal(chatBack.peekChatBackPhase(), "keyboard-dismissed");
  assert.equal(globalThis.window.location.pathname, "/chat/thread-1");
  assert.equal(router.calls.length, 0, "keyboard dismiss must not navigate away yet");

  simulateBrokenScrollOnReturn(fixture, 0);
  globalThis.window.location.pathname = "/chat/thread-1";
  globalThis.window.visualViewport = { height: 400 };
  const leaveNative = handle.resolveNativeBackNavigation("/chat/thread-1");
  assert.equal(leaveNative.navigateTo, "/shuffle");

  if (keep.isInstantShuffleReturnDestination(leaveNative.navigateTo)) {
    keep.prepareInstantShuffleReturn();
    router.replace(leaveNative.navigateTo);
  }
  await flushAsyncRestores();
  assertScrollAndAnchor(fixture, beforeAnchorY, "chat_back_keyboard_then_navigate");
  results.chat_back_keyboard_then_navigate = {
    pass: true,
    dismissPhase: "keyboard-dismissed",
    scrollTop: fixture.mainScroll.scrollTop,
  };
  handle.setBackLockMsOverride(null);
}

// --- Chat UI back via goBackFromChat helper chain ---
{
  navStack.resetNativeNavStackForTests();
  chatBack.resetChatBackNavigationState();
  const fixture = buildFixture();
  captureSnapshot(fixture);
  const beforeAnchorY = fixture.anchorYForCard(fixture.enzoCardId);
  simulateAwayFromShuffle(fixture, "/chat/thread-2");
  navStack.recordNativeNavPath("/shuffle");
  simulateBrokenScrollOnReturn(fixture, 0);
  globalThis.window.location.pathname = "/chat/thread-2";
  globalThis.window.visualViewport = { height: 800 };
  chatBack.setChatBackPhaseForTests("idle");

  const router = createMockRouter();
  const leave = runChatUiBack(router, "/chat/thread-2");
  assert.equal(leave.navigateTo, "/shuffle");
  await flushAsyncRestores();
  assertScrollAndAnchor(fixture, beforeAnchorY, "chat_back_ui_leave");
  results.chat_back_ui_leave = {
    pass: true,
    entrypoint: "goBackFromChat_resolveChatBackDestination",
    scrollTop: fixture.mainScroll.scrollTop,
  };
}
})();

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_BACK_SCROLL_RESTORE",
      pass: true,
      technical: "unit_stub_entrypoints",
      physical: "not_applicable",
      profileCount: PROFILE_COUNT,
      scrollTopTarget: CAPTURED_SCROLL,
      cases: results,
    },
    null,
    2,
  ),
);
