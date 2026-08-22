/**
 * Shuffle → profile → back must keep the pinned window and skip hard reload.
 * Usage: node --experimental-strip-types scripts/shuffle-profile-back-restore.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const scroll = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleFeedScroll.ts")).href
);

assert.equal(
  scroll.shouldSkipHardNavigateForWarmShuffle({
    href: "/shuffle",
    keepAliveActive: true,
  }),
  true,
);
assert.equal(
  scroll.shouldSkipHardNavigateForWarmShuffle({
    href: "/shuffle?x=1",
    keepAliveActive: true,
  }),
  true,
);
assert.equal(
  scroll.shouldSkipHardNavigateForWarmShuffle({
    href: "/shuffle",
    keepAliveActive: false,
  }),
  false,
);
assert.equal(
  scroll.shouldSkipHardNavigateForWarmShuffle({
    href: "/chats",
    keepAliveActive: true,
  }),
  false,
);

const stored = scroll.captureShuffleFeedScroll(640);
assert.equal(stored, 640);
assert.equal(scroll.peekShuffleFeedScroll(), 640);

const alien = { scrollTop: 99 };
const shuffleMain = { scrollTop: 0 };
let hostMounted = false;
const shufflePrep = { style: {}, scrollTop: 0 };
const host = {
  classList: {
    add() {},
    remove() {},
    contains() {
      return false;
    },
  },
  style: {},
  querySelector(sel) {
    const needle = String(sel);
    if (needle.includes("shuffle-surface-prep")) return shufflePrep;
    if (needle.includes("data-scroll-root")) return shuffleMain;
    return null;
  },
  setAttribute() {},
  removeAttribute() {},
  hasAttribute() {
    return false;
  },
  getBoundingClientRect() {
    return { width: 390, height: 844, top: 0, left: 0, right: 390, bottom: 844 };
  },
};

const previousDocument = globalThis.document;
globalThis.document = {
  ...previousDocument,
  getElementById(id) {
    if (id === scroll.SHUFFLE_KEEPALIVE_HOST_ID) {
      return hostMounted ? host : null;
    }
    return previousDocument.getElementById?.(id) ?? null;
  },
  querySelector(sel) {
    if (sel === "[data-scroll-root]" || String(sel).includes("data-scroll-root")) {
      return alien;
    }
    return previousDocument.querySelector?.(sel) ?? null;
  },
};

assert.equal(scroll.findShuffleKeepAliveScrollRoot(), null);

const queued = [];
const restoredBeforeMount = scroll.restoreShuffleFeedScroll({
  attempts: 4,
  schedule: (cb) => {
    queued.push(cb);
  },
});
assert.equal(restoredBeforeMount, 640);
assert.equal(alien.scrollTop, 99);
assert.equal(shuffleMain.scrollTop, 0);
assert.equal(queued.length, 1);

hostMounted = true;
queued.shift()();
assert.equal(shuffleMain.scrollTop, 640);
assert.equal(alien.scrollTop, 99);
assert.equal(scroll.findShuffleKeepAliveScrollRoot(), shuffleMain);

scroll.installShuffleFeedScrollHistoryRestore();
assert.equal(typeof scroll.installShuffleFeedScrollHistoryRestore, "function");

const keep = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleKeepAlive.ts")).href
);
const restore = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleProfileBackRestore.ts")).href
);
const fs = await import("node:fs");
const nativeBoot = fs.readFileSync(
  path.join(root, "src/components/app/NativeAppBootstrap.tsx"),
  "utf8",
);
const profileUi = fs.readFileSync(
  path.join(root, "src/components/modern/ModernPublicProfile.tsx"),
  "utf8",
);
const hostSrc = fs.readFileSync(
  path.join(root, "src/components/shuffle/ShuffleKeepAliveHost.tsx"),
  "utf8",
);
const keepSrc = fs.readFileSync(
  path.join(root, "src/lib/navigation/shuffleKeepAlive.ts"),
  "utf8",
);

assert.match(nativeBoot, /prepareInstantShuffleReturn/);
assert.match(nativeBoot, /recoverShuffleOnForeground/);
assert.match(nativeBoot, /appStateChange/);
assert.match(profileUi, /prepareInstantShuffleReturn/);
const classicProfile = fs.readFileSync(
  path.join(root, "src/app/u/[username]/page.tsx"),
  "utf8",
);
assert.match(classicProfile, /prepareInstantShuffleReturn/);
assert.match(classicProfile, /data-profile-back/);
assert.match(keepSrc, /presentExistingShuffleSnapshot/);
assert.match(hostSrc, /presentExistingShuffleSnapshot/);
assert.match(hostSrc, /parkShuffleKeepAliveForNonMainRoute/);
assert.match(keepSrc, /prepareShuffleRevealFromNonMainRoute/);
assert.match(keepSrc, /parkShuffleKeepAliveForNonMainRoute/);

const canShowFn = keepSrc.slice(
  keepSrc.indexOf("export function canShowShuffleKeepAliveSurface"),
  keepSrc.indexOf("path.startsWith(\"/u/\")"),
);
assert.ok(
  canShowFn.indexOf("isInstantShuffleReturnPending") >= 0,
  "instant return must win before the /u/ hide gate",
);

const html = {
  classList: { add() {}, remove() {}, contains() { return false; } },
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
const body = {
  classList: { add() {}, remove() {}, contains() { return false; } },
};
globalThis.document.documentElement = html;
globalThis.document.body = body;
globalThis.window.location.pathname = "/u/ada";
globalThis.window.getComputedStyle = () => ({
  display: "block",
  visibility: "visible",
  opacity: "1",
  pointerEvents: "auto",
});

keep.pinShuffleKeepAlive();
assert.equal(keep.isShuffleKeepAliveActive(), true);
try {
  keep.prepareInstantShuffleReturn();
} catch {
  // Node harness host is a stub; production DOM is complete.
}
assert.equal(keep.isInstantShuffleReturnPending(), true);
assert.equal(keep.canShowShuffleKeepAliveSurface("/u/ada"), true);
assert.equal(keep.shouldRenderShuffleKeepAliveHost("/u/ada"), true);

let state = restore.initialShuffleProfileBackState();
assert.equal(restore.isShuffleProfileBackBlackFrame(state), false);

for (let i = 0; i < 3; i += 1) {
  state = restore.reduceShuffleProfileBack(state, { type: "open-profile" });
  assert.equal(state.snapshotRetained, true);
  assert.equal(state.surfacePresented, true);
  assert.equal(state.remounted, false);
  assert.equal(restore.isShuffleProfileBackBlackFrame(state), false);

  const hardware = restore.reduceShuffleProfileBack(state, { type: "hardware-back" });
  const ui = restore.reduceShuffleProfileBack(state, { type: "ui-back" });
  assert.deepEqual(hardware, ui);
  assert.equal(restore.isShuffleProfileBackBlackFrame(hardware), false);
  assert.equal(hardware.hostVisible, true);
  assert.equal(hardware.hostFrozen, false);
  assert.equal(hardware.snapshotRetained, true);

  state = restore.reduceShuffleProfileBack(hardware, { type: "route-commit-shuffle" });
  assert.equal(state.path, "/shuffle");
  assert.equal(state.remounted, false);
  assert.equal(restore.isShuffleProfileBackBlackFrame(state), false);
}

console.log(JSON.stringify({ gate: "SHUFFLE_PROFILE_BACK_RESTORE", pass: true }, null, 2));
