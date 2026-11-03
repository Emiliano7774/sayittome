/**
 * Regression: nav warmup + useShufflePool share one pool=full GET (Fix 1).
 *   node scripts/shuffle-pool-full-singleflight.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const poolSrc = fs.readFileSync(
  path.join(root, "src/hooks/useShufflePool.ts"),
  "utf8",
);
const warmSrc = fs.readFileSync(
  path.join(root, "src/lib/shuffle/shufflePoolWarmup.ts"),
  "utf8",
);

assert.match(
  warmSrc,
  /export function fetchShufflePoolFullSingleFlight/,
  "warmup exports shared pool=full single-flight fetch",
);
assert.match(
  warmSrc,
  /export function peekShufflePoolFullJsonFresh/,
  "warmup stashes recent pool=full JSON for hook joiners",
);
assert.match(
  warmSrc,
  /fetchShufflePoolFullSingleFlight\(\)/,
  "nav warmup uses shared fetch",
);

assert.match(
  poolSrc,
  /fetchShufflePoolFullSingleFlight/,
  "hook uses shared pool=full fetch",
);
assert.match(
  poolSrc,
  /isShufflePoolWarmupInFlight\(\)/,
  "hook joins nav warmup inflight before pool GET",
);
assert.match(
  poolSrc,
  /ensureShufflePoolWarmForMicroSlide/,
  "hook awaits nav warmup completion",
);
assert.match(
  poolSrc,
  /peekShufflePoolFullJsonFresh/,
  "hook reuses recent pool=full JSON instead of duplicate GET",
);
assert.match(
  poolSrc,
  /sayittome:shuffle-pool-warmed/,
  "onPoolWarmed event preserved",
);
assert.match(
  poolSrc,
  /applyFromWarmedPoolCache/,
  "missed warm event recovery before listener registration",
);
assert.match(
  poolSrc,
  /const stillWarm = isShufflePoolWarmForNav\(\) && isCachedShufflePoolFresh\(\)/,
  "8m refresh respects nav warm + TTL",
);

console.log("shuffle-pool-full-singleflight.harness: PASS");
process.exit(0);
