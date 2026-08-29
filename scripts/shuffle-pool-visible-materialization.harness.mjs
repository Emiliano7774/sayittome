/**
 * SHUFFLE_POOL_VISIBLE_MATERIALIZATION — pool>0 with empty list must deal a window.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const materialization = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleWindowMaterialization.ts")).href
);
const poolSrc = fs.readFileSync(path.join(root, "src/hooks/useShufflePool.ts"), "utf8");
const followingSrc = fs.readFileSync(path.join(root, "src/hooks/useFollowingProfiles.ts"), "utf8");

assert.equal(
  materialization.shouldDealShuffleWindowDespiteSuppression({
    poolLength: 501,
    featuredLength: 0,
    visibleLength: 0,
  }),
  true,
  "501 pool + empty visible must deal",
);

assert.equal(
  materialization.shouldDealShuffleWindowDespiteSuppression({
    poolLength: 0,
    featuredLength: 3,
    visibleLength: 0,
  }),
  true,
  "featured-only pool must deal",
);

assert.equal(
  materialization.shouldDealShuffleWindowDespiteSuppression({
    poolLength: 501,
    featuredLength: 0,
    visibleLength: 12,
  }),
  false,
  "visible feed must not force re-deal under suppression",
);

assert.equal(
  materialization.shouldDealShuffleWindowDespiteSuppression({
    poolLength: 0,
    featuredLength: 0,
    visibleLength: 0,
  }),
  false,
  "empty pool stays empty",
);

assert.match(poolSrc, /shouldDealShuffleWindowDespiteSuppression/);
assert.match(poolSrc, /fall through — pool ready, visible empty: deal window/);
assert.match(followingSrc, /permission-denied|PERMISSION_DENIED/i);
assert.match(followingSrc, /setLive\(\{ uid, profiles:/);

console.log(
  JSON.stringify({
    gate: "SHUFFLE_POOL_VISIBLE_MATERIALIZATION",
    pass: true,
    cases: {
      pool501_visible0: "DEAL",
      featured_only_visible0: "DEAL",
      pool501_visible12: "SKIP",
      pool0_visible0: "SKIP",
    },
    note: "Warm suppression must not block first paint when pool has profiles",
  }),
);
