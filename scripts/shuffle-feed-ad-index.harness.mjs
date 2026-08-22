/**
 * SHUFFLE_FEED_AD_INDEX
 * Ads OFF: visual index == profile index. Ads ON: subtract only real ad slots.
 * Exhaustive 0..1000. Published ghost map repeats at the interval edge.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const ads = await import(
  pathToFileURL(path.join(root, "src/lib/shuffle/shuffleFeedAds.ts")).href
);

const interval = ads.getShuffleFeedAdInterval();
assert.ok(interval >= 2);

function publishedGhostMap(index) {
  return index - Math.floor((index + 1) / (interval + 1));
}

const edgeCount = interval + 1;
const publishedEdge = Array.from({ length: edgeCount }, (_, index) =>
  publishedGhostMap(index),
);
assert.notEqual(
  new Set(publishedEdge).size,
  publishedEdge.length,
  "published ghost map must fail uniqueness at the interval edge",
);
assert.equal(publishedGhostMap(interval), interval - 1);
assert.equal(ads.getShuffleProfileIndex(interval, edgeCount, false), interval);

function assertProfileIndexContract(profileCount, showAds) {
  const indices = ads.enumerateShuffleFeedProfileIndices(profileCount, showAds);
  for (const index of indices) {
    assert.ok(index >= 0 && index < profileCount, `out of range ${index} for ${profileCount}`);
  }
  assert.equal(indices.length, profileCount);
  assert.equal(new Set(indices).size, profileCount, `duplicates ads=${showAds} n=${profileCount}`);
  for (let i = 0; i < indices.length; i += 1) {
    assert.equal(indices[i], i, `order ads=${showAds} n=${profileCount} at ${i}`);
  }
  if (!showAds) {
    const itemCount = ads.getShuffleFeedItemCount(profileCount, false);
    assert.equal(itemCount, profileCount);
    for (let visual = 0; visual < itemCount; visual += 1) {
      assert.equal(ads.getShuffleProfileIndex(visual, profileCount, false), visual);
    }
  } else {
    const itemCount = ads.getShuffleFeedItemCount(profileCount, true);
    let seen = 0;
    for (let visual = 0; visual < itemCount; visual += 1) {
      if (ads.isShuffleFeedAdIndex(visual, profileCount, true)) continue;
      assert.equal(ads.getShuffleProfileIndex(visual, profileCount, true), seen);
      seen += 1;
    }
    assert.equal(seen, profileCount);
  }
}

for (let profileCount = 0; profileCount <= 1000; profileCount += 1) {
  assertProfileIndexContract(profileCount, false);
  assertProfileIndexContract(profileCount, true);
}

const classicSrc = fs.readFileSync(
  path.join(root, "src/components/shuffle/ShuffleSlots.tsx"),
  "utf8",
);
const modernSrc = fs.readFileSync(
  path.join(root, "src/components/modern/ModernShuffleGrid.tsx"),
  "utf8",
);
const feedSrc = fs.readFileSync(
  path.join(root, "src/components/shuffle/ShuffleFeedWithNativeAds.tsx"),
  "utf8",
);
assert.match(classicSrc, /mode="classic"/);
assert.match(classicSrc, /ShuffleFeedWithNativeAds/);
assert.match(modernSrc, /mode="modern"/);
assert.match(modernSrc, /ShuffleFeedWithNativeAds/);
assert.match(
  feedSrc,
  /getShuffleProfileIndex\(\s*index,\s*profiles\.length,\s*showAds/,
);
assert.match(feedSrc, /renderProfile\(profile, profileIndex\)/);

console.log(
  JSON.stringify(
    {
      gate: "SHUFFLE_FEED_AD_INDEX",
      pass: true,
      interval,
      counts: 1001,
      publishedEdgeDuplicates: publishedEdge.length - new Set(publishedEdge).size,
    },
    null,
    2,
  ),
);
