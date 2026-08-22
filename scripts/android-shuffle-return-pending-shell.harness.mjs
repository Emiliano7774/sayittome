/**
 * ANDROID_SHUFFLE_RETURN_PENDING_SHELL
 * Product CSS: return-pending hides the route shell only when the Shuffle host
 * is visible and not frozen. Unconditional hide + frozen/EMPTY host = black.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const returnIdx = css.indexOf("html.sayittome-shuffle-return-pending:has(");
assert.ok(returnIdx >= 0, "return-pending shell hide must use :has(host)");

const returnBlock = css.slice(returnIdx, returnIdx + 1800);
assert.match(returnBlock, /sayittome-shuffle-keepalive-visible/);
assert.match(returnBlock, /sayittome-shuffle-keepalive-frozen/);
assert.match(returnBlock, /\.sayittome-route-shell/);
assert.doesNotMatch(
  css.replace(returnBlock, ""),
  /html\.sayittome-shuffle-return-pending\s+\.sayittome-route-shell/,
);

const recover = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleForegroundRecover.ts")).href
);

const frozen = {
  classList: {
    contains(name) {
      return name === "sayittome-shuffle-keepalive-frozen";
    },
  },
  querySelector() {
    return null;
  },
};
assert.equal(recover.shouldHideRouteShellForShuffleReturn(frozen), false);
assert.equal(recover.shouldHideRouteShellForShuffleReturn(null), false);

const painted = {
  classList: {
    contains(name) {
      return name === "sayittome-shuffle-keepalive-visible";
    },
  },
  querySelector(sel) {
    if (String(sel).includes("data-shuffle-list")) {
      return {
        querySelector() {
          return { tagName: "ARTICLE" };
        },
      };
    }
    return null;
  },
};
assert.equal(recover.shouldHideRouteShellForShuffleReturn(painted), true);
assert.equal(recover.hasShuffleSnapshotPaint(painted), true);
assert.equal(recover.RESUME_RECOVER_DROPS_HANDOFF_SNAPSHOT, false);

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_SHUFFLE_RETURN_PENDING_SHELL",
      pass: true,
      note: "Source + product helper. Physical Android back still PENDING.",
    },
    null,
    2,
  ),
);
