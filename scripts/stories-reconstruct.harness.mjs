/**
 * Historical reconstruction of still-valid stories.
 *   node scripts/stories-reconstruct.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = await import(
  pathToFileURL(path.join(root, "src/lib/stories/selectStoriesForIndex.ts")).href
);

const now = 2_000_000;
const indexed = [
  { id: "live", expiresAtMs: now + 10_000, createdAtMs: now, active: true },
];
const historical = [
  { id: "orphan", expiresAtMs: now + 8_000, createdAtMs: now - 1, active: undefined },
  { id: "dead", expiresAtMs: now - 10, createdAtMs: now - 2, active: true },
  { id: "off", expiresAtMs: now + 8_000, createdAtMs: now - 3, active: false },
  { id: "noexp", expiresAtMs: 0, createdAtMs: now - 1_000, active: undefined },
];
const rebuilt = index.reconstructActiveStorySet(indexed, historical, now);
assert.equal(rebuilt.some((row) => row.id === "live"), true);
assert.equal(rebuilt.some((row) => row.id === "orphan"), true);
assert.equal(rebuilt.some((row) => row.id === "noexp"), true);
assert.equal(rebuilt.some((row) => row.id === "dead"), false);
assert.equal(rebuilt.some((row) => row.id === "off"), false);

const store = fs.readFileSync(path.join(root, "src/lib/stories/storiesIndexStore.ts"), "utf8");
assert.match(store, /reconstructActiveStoriesIndex/);
assert.match(store, /reconstruct: true/);
assert.match(store, /mergeActiveStoryGroups\(fetched\.groups, cachedGroups/);
assert.match(store, /loadOwnerStoryGroup/);
assert.doesNotMatch(store, /invalidateStoriesIndexAfterMutation\(\);\s*return refreshStoriesIndex/);
const fetchSrc = fs.readFileSync(path.join(root, "src/lib/stories/fetchStories.ts"), "utf8");
assert.match(fetchSrc, /fetchReconstructStoryDocs/);
assert.match(fetchSrc, /fetchOwnerStoryGroup/);
assert.match(fetchSrc, /paginateHistoriasByField\("createdAt"/);
assert.doesNotMatch(fetchSrc, /where\("active", "==", true\)/);
const boot = fs.readFileSync(path.join(root, "src/components/stories/StoriesBootstrap.tsx"), "utf8");
assert.match(boot, /reconstructActiveStoriesIndex/);
assert.match(boot, /refreshStoriesIndex\(viewerKey, false\)/);

console.log("PASS stories-reconstruct");
