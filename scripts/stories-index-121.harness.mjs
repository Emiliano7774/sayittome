/**
 * 121 active stories: newest expiresAt must always be in the selected 120.
 * Usage: node --experimental-strip-types scripts/stories-index-121.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  selectStoriesForIndex,
  compareStoriesNewestFirst,
  shouldKeepScanningStoryFallback,
  STORIES_FIRESTORE_INDEX,
} = await import(
  pathToFileURL(path.join(root, "src/lib/stories/selectStoriesForIndex.ts")).href
);

const now = 1_000_000;
const docs = Array.from({ length: 121 }, (_, i) => ({
  id: `story_${String(i).padStart(3, "0")}`,
  expiresAtMs: now + 1_000 + i * 1_000,
  createdAtMs: now + i,
}));
docs.push({
  id: "newest",
  expiresAtMs: now + 1_000 + 200_000,
  createdAtMs: now + 999,
});
docs.push({
  id: "expired",
  expiresAtMs: now - 1,
  createdAtMs: now + 500,
});
docs.push({
  id: "deleted",
  expiresAtMs: now + 500_000,
  createdAtMs: now + 500,
  adminDeleted: true,
});

const selected = selectStoriesForIndex(docs, { limit: 120, now });
assert.equal(selected.length, 120);
assert.equal(selected.some((doc) => doc.id === "newest"), true, "newest must be included");
assert.equal(selected.some((doc) => doc.id === "expired"), false);
assert.equal(selected.some((doc) => doc.id === "deleted"), false);
assert.equal(selected.some((doc) => doc.id === "story_000"), false, "oldest of 121 must drop");

const copy = selected.slice().sort(compareStoriesNewestFirst);
assert.deepEqual(
  copy.map((doc) => doc.id),
  selected.map((doc) => doc.id),
  "result is already newest-first",
);
assert.equal(selected[0].id, "newest");
assert.equal(
  shouldKeepScanningStoryFallback({ pageSize: 400, pageCount: 1, lastPageSize: 400 }),
  true,
);
assert.equal(
  shouldKeepScanningStoryFallback({ pageSize: 400, pageCount: 2, lastPageSize: 12 }),
  false,
);

const indexes = fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8");
assert.match(indexes, /"fieldPath": "expiresAt",\s*"order": "DESCENDING"/);
const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
assert.match(pkg, /firestore:indexes/);
assert.equal(STORIES_FIRESTORE_INDEX.collection, "historias");
assert.equal(STORIES_FIRESTORE_INDEX.order, "DESCENDING");
assert.equal(STORIES_FIRESTORE_INDEX.version, 1);

console.log(JSON.stringify({
  gate: "STORIES_INDEX_121",
  pass: true,
  selected: selected.length,
  newestIncluded: true,
}, null, 2));
