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
];
const rebuilt = index.reconstructActiveStorySet(indexed, historical, now);
assert.equal(rebuilt.some((row) => row.id === "live"), true);
assert.equal(rebuilt.some((row) => row.id === "orphan"), true);
assert.equal(rebuilt.some((row) => row.id === "dead"), false);
assert.equal(rebuilt.some((row) => row.id === "off"), false);

const store = fs.readFileSync(path.join(root, "src/lib/stories/storiesIndexStore.ts"), "utf8");
assert.match(store, /reconstructActiveStoriesIndex/);
assert.match(store, /reconstruct: true/);
const fetchSrc = fs.readFileSync(path.join(root, "src/lib/stories/fetchStories.ts"), "utf8");
assert.match(fetchSrc, /fetchReconstructStoryDocs/);
const boot = fs.readFileSync(path.join(root, "src/components/stories/StoriesBootstrap.tsx"), "utf8");
assert.match(boot, /reconstructActiveStoriesIndex/);

console.log("PASS stories-reconstruct");
