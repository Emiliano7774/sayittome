/**
 * Instant /shuffle entry: all zones, 0 slide/defer/loading, stable host/key/scroll.
 * Imports production planners, flags, commit, warmup, identity, back restore.
 * Usage: node --experimental-strip-types scripts/instant-shuffle-entry.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

function classListStub(initial = []) {
  const set = new Set(initial);
  return {
    add: (...xs) => xs.forEach((x) => set.add(x)),
    remove: (...xs) => xs.forEach((x) => set.delete(x)),
    contains: (x) => set.has(x),
    toggle(x, force) {
      if (force === true) set.add(x);
      else if (force === false) set.delete(x);
      else if (set.has(x)) set.delete(x);
      else set.add(x);
      return set.has(x);
    },
  };
}

const hostClassList = classListStub(["sayittome-shuffle-keepalive-frozen"]);
const htmlClassList = classListStub();
const bodyClassList = classListStub();
const scrollRoot = { scrollTop: 240 };
const host = {
  id: "sayittome-shuffle-keepalive-host",
  classList: hostClassList,
  style: {},
  hidden: false,
  attributes: new Map(),
  querySelector(sel) {
    if (String(sel).includes("data-scroll-root")) return scrollRoot;
    return null;
  },
  querySelectorAll() {
    return [];
  },
  appendChild(node) {
    return node;
  },
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  },
  removeAttribute(name) {
    this.attributes.delete(name);
  },
  hasAttribute(name) {
    return this.attributes.has(name) || (name === "hidden" && this.hidden);
  },
  getAttribute(name) {
    if (name === "hidden") return this.hidden ? "" : null;
    return this.attributes.get(name) ?? null;
  },
  getBoundingClientRect() {
    return { width: 390, height: 720, top: 0, left: 0, right: 390, bottom: 720 };
  },
};

const html = {
  classList: htmlClassList,
  attributes: new Map(),
  hasAttribute(name) {
    return this.attributes.has(name);
  },
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  },
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  },
  removeAttribute(name) {
    this.attributes.delete(name);
  },
};

globalThis.document = {
  documentElement: html,
  body: { classList: bodyClassList },
  addEventListener() {},
  removeEventListener() {},
  getElementById(id) {
    return id === "sayittome-shuffle-keepalive-host" ? host : null;
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return {
      style: { cssText: "" },
      textContent: "",
      setAttribute() {},
      classList: classListStub(),
    };
  },
};
globalThis.window.document = globalThis.document;
globalThis.window.location.pathname = "/chats";
globalThis.window.history = {
  length: 3,
  state: null,
  pushState(_state, _title, url) {
    this.state = _state;
    globalThis.window.location.pathname = String(url || "/").split("?")[0];
  },
  replaceState(_state, _title, url) {
    this.state = _state;
    if (url) {
      globalThis.window.location.pathname = String(url).split("?")[0];
    }
  },
};
globalThis.window.getComputedStyle = () => ({
  display: "block",
  visibility: "visible",
  opacity: "1",
});
globalThis.performance = globalThis.performance || {
  now: () => Date.now(),
  timeOrigin: Date.now(),
};

const flags = await import(
  pathToFileURL(path.join(root, "src/lib/perf/instantaneityFlags.ts")).href
);
const entry = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/instantShuffleEntry.ts")).href
);
const loadingGate = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleLoadingPresentationGate.ts")).href
);
const identity = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/dedupeProfiles.ts")).href
);
const scroll = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleFeedScroll.ts")).href
);
const backRestore = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleProfileBackRestore.ts")).href
);
const clickBridge = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClickBridge.ts")).href
);
const transition = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/mainTabToShuffleTransition.ts")).href
);
const warmup = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shufflePoolWarmup.ts")).href
);
const cache = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleClientCache.ts")).href
);
const warmNav = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/warmShuffleTabNavigation.ts")).href
);
const keepAlive = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleKeepAlive.ts")).href
);

assert.equal(flags.getMicroSlideBuildDefault(), false);
assert.equal(flags.isMainTabToShuffleMicroSlideEnabled(), false);

const flagSrc = fs.readFileSync(
  path.join(root, "src/lib/perf/instantaneityFlags.ts"),
  "utf8",
);
assert.match(flagSrc, /MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*false/);
assert.doesNotMatch(flagSrc, /MAIN_TAB_TO_SHUFFLE_MICRO_SLIDE:\s*true/);

const warmSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/warmShuffleTabNavigation.ts"),
  "utf8",
);
assert.doesNotMatch(warmSrc, /registerDeferredMicroSlideRouteCommit/);
assert.doesNotMatch(warmSrc, /beginInternalMainTabToShuffleTransition/);
assert.match(warmSrc, /instant-shuffle-entry/);

const zones = [
  ["/stories", "stories"],
  ["/chats", "chats"],
  ["/boost", "boost"],
  ["/settings", "settings"],
  ["/u/ada", "profile"],
  ["/u/ada/chat", "profile-chat"],
  ["/chat/thread-1", "chat-thread"],
  ["/login", "non-main"],
];

const card = {
  uid: "user-a",
  authUid: "auth-a",
  username: "ada",
  photo: "https://example/a.jpg",
};
const visualKey = identity.shuffleProfileIdentityKey(card);
assert.match(visualKey, /^sid:/);

scroll.captureShuffleFeedScroll(240);
assert.equal(scroll.peekShuffleFeedScroll(), 240);

keepAlive.pinShuffleKeepAlive();
const hostIdBefore = scroll.SHUFFLE_KEEPALIVE_HOST_ID;

for (const [fromPath, zone] of zones) {
  const web = entry.planInstantShuffleEntry({
    fromPath,
    microSlideEnabled: true,
    nativeShellHardNavWouldApply: false,
  });
  const native = entry.planInstantShuffleEntry({
    fromPath,
    microSlideEnabled: true,
    nativeShellHardNavWouldApply: true,
  });
  const anon = entry.planInstantShuffleEntry({ fromPath });
  const authed = entry.planInstantShuffleEntry({ fromPath });

  for (const plan of [web, native, anon, authed]) {
    assert.equal(plan.zone, zone, fromPath);
    assert.equal(plan.beginMicroSlide, false, fromPath);
    assert.equal(plan.deferRouteCommit, false, fromPath);
    assert.equal(plan.useStageOrTransform, false, fromPath);
    assert.equal(plan.allowLoadingShell, false, fromPath);
    assert.equal(plan.remountHost, false, fromPath);
    assert.equal(plan.reshuffle, false, fromPath);
    assert.equal(plan.commitUrlSync, true, fromPath);
    assert.equal(plan.presentHostSync, true, fromPath);
    assert.equal(plan.commitWithinRafs, 0, fromPath);
    assert.equal(plan.extraFirestoreReads, 0, fromPath);
    assert.equal(plan.extraFunctionsCalls, 0, fromPath);
    assert.equal(plan.extraStorageOps, 0, fromPath);
    assert.equal(plan.backgroundSingleFlightRevalidate, true, fromPath);
  }
  assert.equal(web.commitMode, "soft");
  assert.equal(native.commitMode, "history");
  assert.equal(identity.shuffleProfileIdentityKey(card), visualKey);
  assert.equal(scroll.peekShuffleFeedScroll(), 240);
  assert.equal(scroll.SHUFFLE_KEEPALIVE_HOST_ID, hostIdBefore);
}

const onShuffle = entry.planInstantShuffleEntry({ fromPath: "/shuffle" });
assert.equal(onShuffle.reshuffle, true);
assert.equal(onShuffle.commitUrlSync, false);
assert.equal(onShuffle.beginMicroSlide, false);
assert.equal(onShuffle.deferRouteCommit, false);

let reshuffleCount = 0;
clickBridge.registerShuffleClickHandler(() => {
  reshuffleCount += 1;
});
clickBridge.triggerShuffleClick();
clickBridge.triggerShuffleClick();
assert.equal(reshuffleCount, 2);

const pop = entry.planInstantShuffleEntry({
  fromPath: "/u/ada",
  popstateRestore: true,
});
assert.equal(pop.zone, "popstate");
assert.equal(pop.beginMicroSlide, false);
assert.equal(pop.deferRouteCommit, false);
assert.equal(pop.useStageOrTransform, false);
assert.equal(pop.presentHostSync, true);
assert.equal(pop.commitUrlSync, false);
assert.equal(pop.reshuffle, false);

assert.equal(
  transition.beginInternalMainTabToShuffleTransition("chats", {
    triggerType: "user-main-tab-click",
  }),
  false,
);
assert.equal(transition.getMainTabToShufflePhase(), "idle");
assert.equal(transition.isInternalMainTabToShuffleTransitionActive(), false);

const rapid = [];
for (let i = 0; i < 8; i += 1) {
  rapid.push(entry.planInstantShuffleEntry({ fromPath: "/chats" }));
}
for (const plan of rapid) {
  assert.equal(plan.beginMicroSlide, false);
  assert.equal(plan.deferRouteCommit, false);
  assert.equal(plan.commitUrlSync, true);
}

const loadingWarm = loadingGate.computeMayPresentShuffleLoading({
  microSlideEnabled: false,
  wouldShowLoading: true,
  trueCold: false,
  presentationOwned: false,
  presentationLatchActive: false,
  warmHopIntentActive: false,
  revealDeferred: false,
  handoffPreparing: false,
  directColdEntry: false,
  warmKeepAliveActive: true,
});
assert.equal(loadingWarm.mayPresent, false);
assert.equal(loadingWarm.blockReason, "instant-shuffle-entry-no-loading");

const loadingHandoff = loadingGate.computeMayPresentShuffleLoading({
  microSlideEnabled: false,
  wouldShowLoading: true,
  trueCold: true,
  presentationOwned: false,
  presentationLatchActive: false,
  warmHopIntentActive: true,
  revealDeferred: true,
  handoffPreparing: true,
  directColdEntry: false,
  warmKeepAliveActive: false,
});
assert.equal(loadingHandoff.mayPresent, false);

let back = backRestore.initialShuffleProfileBackState();
back = backRestore.reduceShuffleProfileBack(back, { type: "open-profile" });
back = backRestore.reduceShuffleProfileBack(back, { type: "hardware-back" });
assert.equal(back.remounted, false);
assert.equal(back.snapshotRetained, true);
assert.equal(back.hostVisible, true);
assert.equal(backRestore.isShuffleProfileBackBlackFrame(back), false);
back = backRestore.reduceShuffleProfileBack(back, { type: "route-commit-shuffle" });
assert.equal(back.path, "/shuffle");
assert.equal(back.hostVisible, true);
assert.equal(back.remounted, false);

const profiles = [
  { uid: "a", username: "ada" },
  { uid: "b", username: "bea" },
  { uid: "c", username: "cia" },
];
cache.writeCachedShufflePool(profiles);
assert.equal(warmup.isShufflePoolWarmForNav(), true);
const budget = entry.planShuffleEntryRevalidateBudget({
  poolWarm: warmup.isShufflePoolWarmForNav(),
  warmupInFlight: warmup.isShufflePoolWarmupInFlight(),
});
assert.equal(budget.mayStartNetworkWarmup, false);
assert.equal(budget.extraFirestoreReads, 0);
assert.equal(budget.extraFunctionsCalls, 0);
assert.equal(budget.extraStorageOps, 0);
assert.equal(budget.backgroundSingleFlight, true);
const warmState = await warmup.ensureShufflePoolWarmForMicroSlide();
assert.equal(warmState, "ready");
assert.equal(warmup.isShufflePoolWarmupInFlight(), false);

const pushes = [];
const router = {};
function fakePush(_router, href, options) {
  pushes.push({ href, options });
  globalThis.window.location.pathname = href;
}

globalThis.window.location.pathname = "/chats";
warmNav.commitPreparedMainTabToShuffleNavigation(router, fakePush, "/chats");
assert.equal(pushes.length, 1);
assert.equal(pushes[0].href, "/shuffle");
assert.equal(pushes[0].options?.forceSoftNavigation, true);
assert.equal(pushes[0].options?.forceHistoryNavigation, undefined);
assert.equal(transition.getMainTabToShufflePhase(), "idle");
assert.equal(transition.isInternalMainTabToShuffleTransitionActive(), false);
assert.equal(identity.shuffleProfileIdentityKey(card), visualKey);
assert.equal(scroll.peekShuffleFeedScroll(), 240);
assert.equal(scroll.SHUFFLE_KEEPALIVE_HOST_ID, hostIdBefore);

pushes.length = 0;
globalThis.window.location.pathname = "/u/ada";
warmNav.commitNonMainRouteToShuffleNavigation(router, fakePush, "/u/ada");
assert.equal(pushes.length, 1);
assert.equal(pushes[0].href, "/shuffle");
assert.equal(
  Boolean(
    pushes[0].options?.forceSoftNavigation ||
      pushes[0].options?.forceHistoryNavigation,
  ),
  true,
);
assert.equal(transition.isInternalMainTabToShuffleTransitionActive(), false);

console.log("instant-shuffle-entry.harness: PASS");
process.exit(0);
