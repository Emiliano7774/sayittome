/**
 * ANDROID_SHUFFLE_RESUME_RECOVER
 * Native resume must present the existing Shuffle snapshot, clear stale latches,
 * keep scroll, and never remount or tape an empty black background.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const boot = fs.readFileSync(
  path.join(root, "src/components/app/NativeAppBootstrap.tsx"),
  "utf8",
);
assert.match(boot, /recoverShuffleOnForeground\("app-resume"\)/);
assert.match(boot, /appStateChange/);
const listener = boot.slice(boot.indexOf("appStateChange"));
assert.match(listener, /recoverShuffleOnForeground/);
assert.ok(
  listener.indexOf("recoverShuffleOnForeground") < listener.indexOf("} catch"),
  "resume recover must run inside the active branch",
);

const recover = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleForegroundRecover.ts")).href
);
const back = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleProfileBackRestore.ts")).href
);

assert.equal(recover.RESUME_RECOVER_DROPS_HANDOFF_SNAPSHOT, false);
globalThis.window.location.pathname = "/chats";
assert.equal(recover.shouldRecoverShuffleOnForeground("/chats"), false);
globalThis.window.location.pathname = "/shuffle";
assert.equal(recover.shouldRecoverShuffleOnForeground("/shuffle"), true);

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
    if (String(sel).includes("data-shuffle-list")) {
      return {
        querySelector() {
          return { tagName: "ARTICLE" };
        },
      };
    }
    if (String(sel).includes("shuffle-surface-prep")) {
      return { style: {}, childElementCount: 2 };
    }
    return null;
  },
  setAttribute() {},
  removeAttribute() {},
};

const previousDocument = globalThis.document;
globalThis.document = {
  ...previousDocument,
  documentElement: {
    classList: { add() {}, remove() {}, contains() { return false; } },
    hasAttribute() { return false; },
    getAttribute() { return null; },
    setAttribute() {},
    removeAttribute() {},
  },
  body: { classList: { add() {}, remove() {}, contains() { return false; } } },
  getElementById(id) {
    return id === recover.SHUFFLE_KEEPALIVE_HOST_ID ? host : null;
  },
};
globalThis.window.location.pathname = "/shuffle";

const empty = recover.presentExistingShuffleSnapshot({ reason: "app-resume" });
assert.equal(empty.remounted, false);
assert.equal(empty.emptiedBackground, false);

const presented = recover.presentExistingShuffleSnapshot({ reason: "app-resume" });
assert.equal(presented.presented, true);
assert.equal(presented.remounted, false);
assert.equal(presented.emptiedBackground, false);
assert.equal(presented.hostFrozen, false);
assert.equal(host.classList.contains("sayittome-shuffle-keepalive-visible"), true);
assert.equal(host.classList.contains("sayittome-shuffle-keepalive-frozen"), false);

let state = back.initialShuffleProfileBackState();
for (let i = 0; i < 4; i += 1) {
  state = back.reduceShuffleProfileBack(state, { type: "open-profile" });
  const hardware = back.reduceShuffleProfileBack(state, { type: "hardware-back" });
  const ui = back.reduceShuffleProfileBack(state, { type: "ui-back" });
  assert.deepEqual(hardware, ui);
  assert.equal(back.isShuffleProfileBackBlackFrame(hardware), false);
  assert.equal(hardware.snapshotPainted, true);
  assert.equal(hardware.routeShellHidden, false);
  state = back.reduceShuffleProfileBack(hardware, { type: "route-commit-shuffle" });
  assert.equal(back.isShuffleProfileBackBlackFrame(state), false);
}

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_SHUFFLE_RESUME_RECOVER",
      pass: true,
      note: "Product recover imported. Physical background/resume still PENDING.",
    },
    null,
    2,
  ),
);
