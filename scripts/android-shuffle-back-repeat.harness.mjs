/**
 * ANDROID_SHUFFLE_BACK_REPEAT
 * Hardware and UI back from public profile must share the same recover path,
 * keep the snapshot, and never hide the route shell over a frozen/EMPTY host.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const keep = fs.readFileSync(
  path.join(root, "src/lib/navigation/shuffleKeepAlive.ts"),
  "utf8",
);
const boot = fs.readFileSync(
  path.join(root, "src/components/app/NativeAppBootstrap.tsx"),
  "utf8",
);
const classic = fs.readFileSync(
  path.join(root, "src/app/u/[username]/page.tsx"),
  "utf8",
);
const modern = fs.readFileSync(
  path.join(root, "src/components/modern/ModernPublicProfile.tsx"),
  "utf8",
);
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

assert.match(keep, /presentExistingShuffleSnapshot\(\{ reason: "profile-back" \}\)/);
assert.match(boot, /prepareInstantShuffleReturn/);
assert.match(classic, /prepareInstantShuffleReturn/);
assert.match(classic, /data-profile-back/);
assert.match(modern, /prepareInstantShuffleReturn/);
assert.match(css, /sayittome-shuffle-return-pending:has\(/);

const back = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleProfileBackRestore.ts")).href
);
const recover = await import(
  pathToFileURL(path.join(root, "src/lib/navigation/shuffleForegroundRecover.ts")).href
);

let state = back.initialShuffleProfileBackState();
for (let i = 0; i < 6; i += 1) {
  state = back.reduceShuffleProfileBack(state, { type: "open-profile" });
  const via = i % 2 === 0 ? "hardware-back" : "ui-back";
  const next = back.reduceShuffleProfileBack(state, { type: via });
  assert.equal(next.hostVisible, true);
  assert.equal(next.hostFrozen, false);
  assert.equal(next.snapshotRetained, true);
  assert.equal(next.snapshotPainted, true);
  assert.equal(next.routeShellHidden, false);
  assert.equal(next.remounted, false);
  assert.equal(back.isShuffleProfileBackBlackFrame(next), false);
  state = back.reduceShuffleProfileBack(next, { type: "route-commit-shuffle" });
}

assert.equal(recover.RESUME_RECOVER_DROPS_HANDOFF_SNAPSHOT, false);
assert.equal(
  recover.shouldHideRouteShellForShuffleReturn({
    classList: { contains: (name) => name === "sayittome-shuffle-keepalive-frozen" },
    querySelector: () => null,
  }),
  false,
);

console.log(
  JSON.stringify(
    {
      gate: "ANDROID_SHUFFLE_BACK_REPEAT",
      pass: true,
      note: "Product reducer imported. Physical repeated Android back still PENDING.",
    },
    null,
    2,
  ),
);
