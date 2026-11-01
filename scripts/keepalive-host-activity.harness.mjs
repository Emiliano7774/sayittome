/**
 * Keep-alive frozen host must report inactive so preview videos pause.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const mod = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/keepAliveHostActivity.ts")).href
);

const host = {
  classList: {
    _c: new Set(["sayittome-shuffle-keepalive-frozen"]),
    contains(name) {
      return this._c.has(name);
    },
    add(name) {
      this._c.add(name);
    },
    remove(name) {
      this._c.delete(name);
    },
  },
};

assert.equal(mod.isKeepAliveHostFrozen(host), true);
assert.equal(mod.isMediaSurfaceHostActive(null), true);

host.classList.remove("sayittome-shuffle-keepalive-frozen");
host.classList.add("sayittome-shuffle-keepalive-visible");
assert.equal(mod.isKeepAliveHostFrozen(host), false);

const main = {
  classList: {
    _c: new Set(["sayittome-main-tab-keepalive-frozen"]),
    contains(name) {
      return this._c.has(name);
    },
  },
};
assert.equal(mod.isKeepAliveHostFrozen(main), true);

console.log("keepalive-host-activity.harness: PASS");
