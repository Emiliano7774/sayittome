/**
 * SHUFFLE_BATCH_MEMORY_POOL — exclude prior windows so each tap prefers unseen people.
 * Cap grows with the registered pool: floor((pool - 35) / 35). 505 → 13.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const pickWindow = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/pickWindow.ts")).href
);
const poolSrc = fs.readFileSync(path.join(root, "src/hooks/useShufflePool.ts"), "utf8");

const WINDOW = pickWindow.SHUFFLE_WINDOW_SIZE;
assert.equal(WINDOW, 35);
assert.equal(pickWindow.shuffleBatchMemoryForPool(340), 8, "legacy ~340 pool stays at 8");
assert.equal(pickWindow.SHUFFLE_BATCH_MEMORY, 8);
assert.equal(pickWindow.shuffleBatchMemoryForPool(505), 13, "505 registered → 13 prior windows");
assert.equal(pickWindow.shuffleBatchMemoryForPool(574), 15, "574 registered → 15 prior windows");
assert.equal(pickWindow.shuffleBatchMemoryForPool(500), 13);
assert.equal(pickWindow.shuffleBatchMemoryForPool(525), 14);
assert.equal(pickWindow.shuffleBatchMemoryForPool(35), 0);
assert.equal(pickWindow.shuffleBatchMemoryForPool(70), 1);
assert.equal(pickWindow.shuffleBatchMemoryForPool(0), 0);

function makePool(n) {
  return Array.from({ length: n }, (_, index) => ({
    uid: `uid_${index + 1}`,
    username: `user${index + 1}`,
    authUid: `uid_${index + 1}`,
  }));
}

const dedupe = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/dedupeProfiles.ts")).href
);

function keysFromWindow(pool, indices, count) {
  const keys = new Set();
  for (let i = 0; i < count; i += 1) {
    for (const key of dedupe.shuffleProfileBatchExcludeKeys(pool[indices[i]])) {
      keys.add(key);
    }
  }
  return keys;
}

const pool = makePool(505);
const cap = pickWindow.shuffleBatchMemoryForPool(pool.length);
assert.equal(cap, 13);

const scratch = [];
const out = new Int32Array(WINDOW);
const batches = [];
const seen = new Set();
let exclude = new Set();

for (let round = 0; round < cap + 1; round += 1) {
  const count = pickWindow.pickRandomUniqueWindowIndices(
    pool,
    scratch,
    out,
    WINDOW,
    exclude,
    { strictExclude: true },
  );
  assert.equal(count, WINDOW, `round ${round} must fill a full window from unseen people`);
  const batchKeys = keysFromWindow(pool, out, count);
  for (let i = 0; i < count; i += 1) {
    const uid = pool[out[i]].uid;
    assert.equal(seen.has(uid), false, `round ${round} reused ${uid}`);
    seen.add(uid);
  }
  batches.push(batchKeys);
  while (batches.length > cap) batches.shift();
  exclude = new Set();
  for (const batch of batches) {
    for (const key of batch) exclude.add(key);
  }
}

assert.equal(seen.size, WINDOW * (cap + 1), "14 full windows from 505 without reuse");
assert.ok(seen.size >= 490, "almost the full registered pool before anyone repeats");

assert.match(poolSrc, /shuffleBatchMemoryForPool/);
assert.match(poolSrc, /batchMemoryCap/);
assert.doesNotMatch(
  poolSrc,
  /while \(queue\.length > SHUFFLE_BATCH_MEMORY\)/,
  "hook must not hard-cap memory at the legacy 8",
);

console.log(
  JSON.stringify({
    gate: "SHUFFLE_BATCH_MEMORY_POOL",
    pass: true,
    window: WINDOW,
    pool505: {
      memoryCap: cap,
      uniqueBeforeReuse: seen.size,
      registered: 505,
    },
    note: "Tap shuffle excludes prior windows until the 500+ registered pool has been listed",
  }),
);
