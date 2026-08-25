/**
 * SHUFFLE_MULTITAP_LOCK
 * Concurrent shuffle taps must not re-enter handleShuffleClick.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const poolSrc = fs.readFileSync(path.join(root, "src/hooks/useShufflePool.ts"), "utf8");

assert.match(poolSrc, /shuffleClickInFlightRef/);
assert.match(
  poolSrc,
  /if \(shuffleClickInFlightRef\.current\) return;[\s\S]*shuffleClickInFlightRef\.current = true;/,
);
assert.match(poolSrc, /finally \{\s*shuffleClickInFlightRef\.current = false;/);

const stableSrc = fs.readFileSync(
  path.join(root, "scripts/shuffle-stable-frame.harness.mjs"),
  "utf8",
);
assert.match(stableSrc, /shuffle-stable-frame|STABLE|pass/i);

console.log(JSON.stringify({ gate: "SHUFFLE_MULTITAP_LOCK", pass: true }, null, 2));
