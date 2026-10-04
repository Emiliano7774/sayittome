/**
 * Active stories must stay in the feed. A single 120-doc page used to drop
 * the oldest / 10th tile; paging + merge keeps them, and the mosaic must scroll.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = await import(
  pathToFileURL(path.join(root, "src/lib/stories/selectStoriesForIndex.ts")).href
);

assert.equal(
  index.shouldFetchNextStoriesPage({
    lastPageSize: 120,
    pageSize: 120,
    collected: 120,
    maxDocs: 3000,
  }),
  true,
  "a full first page must request the next page",
);
assert.equal(
  index.shouldFetchNextStoriesPage({
    lastPageSize: 9,
    pageSize: 120,
    collected: 129,
  }),
  false,
  "a short page is the end of the feed",
);

const now = 2_000_000;
const many = Array.from({ length: 121 }, (_, i) => ({
  id: `story_${String(i).padStart(3, "0")}`,
  expiresAtMs: now + 1_000 + i * 1_000,
  createdAtMs: now + i,
}));
const all = index.selectStoriesForIndex(many, { now });
assert.equal(all.length, 121, "unbounded select keeps every active story");
assert.equal(all.some((doc) => doc.id === "story_000"), true);

const incoming = [
  {
    ownerUid: "a",
    stories: [{ id: "s1", createdAtMs: 1, expiresAtMs: now + 10_000 }],
  },
];
for (let i = 2; i <= 9; i += 1) {
  incoming.push({
    ownerUid: `u${i}`,
    stories: [{ id: `n${i}`, createdAtMs: i, expiresAtMs: now + 10_000 }],
  });
}
const previous = [
  ...incoming,
  {
    ownerUid: "tenth",
    stories: [{ id: "s10", createdAtMs: 0, expiresAtMs: now + 10_000 }],
  },
];
const merged = index.mergeActiveStoryGroups(incoming, previous, now);
assert.equal(merged.length, 10, "the 10th still-active story must survive a short refresh");
assert.equal(merged.some((group) => group.ownerUid === "tenth"), true);

const fetchSrc = fs.readFileSync(path.join(root, "src/lib/stories/fetchStories.ts"), "utf8");
assert.match(fetchSrc, /shouldFetchNextStoriesPage/);
assert.match(fetchSrc, /truncated: snap\.truncated === true/);

const storeSrc = fs.readFileSync(path.join(root, "src/lib/stories/storiesIndexStore.ts"), "utf8");
assert.match(storeSrc, /mergeActiveStoryGroups\(fetched\.groups, cachedGroups/);
assert.match(storeSrc, /reconstructActiveStoriesIndex/);
assert.match(storeSrc, /loadOwnerStoryGroup/);

const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
assert.match(
  css,
  /#sayittome-main-tab-keepalive-stories\.sayittome-main-tab-keepalive-visible[\s\S]*overflow-y:\s*auto/,
);

console.log(
  JSON.stringify({
    gate: "STORIES_KEEP_ALL_ACTIVE",
    pass: true,
    covers: ["page-past-120", "keep-121", "keep-tenth-on-merge", "mosaic-scroll"],
  }),
);
