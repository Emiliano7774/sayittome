/**
 * Snapshot fetchedAtMs vs persistedAtMs, empty tombstone, viewer isolation.
 * Usage: node --experimental-strip-types scripts/stories-snapshot-ttl.harness.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  buildStoriesSnapshotWrite,
  selectLatestStoriesSnapshot,
  pickLatestStoriesSnapshot,
  snapshotFreshnessMs,
  isStoriesSnapshotFresh,
  STORIES_SNAPSHOT_TTL_MS,
  didTruncateStoriesSnapshot,
} = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storiesQueryGuard.ts")).href
);

const t0 = 1_700_000_000_000;
const group = { ownerUid: "owner_1" };

const afterFetch = buildStoriesSnapshotWrite({
  viewerUid: "viewer_a",
  groups: [group],
  previous: null,
  source: "network",
  now: t0,
});
assert.equal(afterFetch.fetchedAtMs, t0);
assert.equal(afterFetch.persistedAtMs, t0);
assert.equal(afterFetch.savedAtMs, t0);
assert.equal(afterFetch.generation, 1);
assert.equal(afterFetch.groups.length, 1);

const afterAck = buildStoriesSnapshotWrite({
  viewerUid: "viewer_a",
  groups: [group],
  previous: afterFetch,
  source: "local",
  now: t0 + 4_000,
});
assert.equal(afterAck.fetchedAtMs, t0, "local ACK must not reset fetchedAtMs");
assert.equal(afterAck.persistedAtMs, t0 + 4_000);
assert.equal(afterAck.savedAtMs, t0 + 4_000);
assert.equal(afterAck.generation, 1, "local ACK keeps generation");
assert.equal(snapshotFreshnessMs(afterAck), t0);

const tombstone = buildStoriesSnapshotWrite({
  viewerUid: "viewer_a",
  groups: [],
  previous: afterAck,
  source: "network",
  now: t0 + 5_000,
});
assert.equal(tombstone.groups.length, 0, "empty network snapshot is a tombstone");
assert.equal(tombstone.fetchedAtMs, t0 + 5_000);
assert.equal(tombstone.generation, 2);

const otherViewer = buildStoriesSnapshotWrite({
  viewerUid: "viewer_b",
  groups: [group],
  previous: tombstone,
  source: "network",
  now: t0 + 6_000,
});
assert.equal(otherViewer.viewerUid, "viewer_b");
assert.equal(otherViewer.generation, 1, "other viewer does not inherit generation");
assert.equal(otherViewer.fetchedAtMs, t0 + 6_000);

const kept = selectLatestStoriesSnapshot(
  { viewerUid: "viewer_a", generation: 3, groups: [group] },
  { viewerUid: "viewer_a", generation: 2, groups: [] },
);
assert.equal(kept?.generation, 3);
assert.equal(kept?.groups.length, 1, "never restore empty fetch over newer generation");

const switched = selectLatestStoriesSnapshot(
  { viewerUid: "viewer_a", generation: 3, groups: [group] },
  { viewerUid: "viewer_b", generation: 1, groups: [] },
);
assert.equal(switched?.viewerUid, "viewer_b");

assert.equal(isStoriesSnapshotFresh(t0, t0 + STORIES_SNAPSHOT_TTL_MS), true);
assert.equal(isStoriesSnapshotFresh(t0, t0 + STORIES_SNAPSHOT_TTL_MS + 1), false);

const memoryNonEmpty = {
  viewerUid: "viewer_a",
  generation: 1,
  groups: [group],
  fetchedAtMs: t0,
  persistedAtMs: t0,
  savedAtMs: t0,
};
const localEmptyNewer = {
  viewerUid: "viewer_a",
  generation: 1,
  groups: [],
  fetchedAtMs: t0,
  persistedAtMs: t0 + 8_000,
  savedAtMs: t0 + 8_000,
};
const sameGenEmptyWins = pickLatestStoriesSnapshot(
  [memoryNonEmpty, localEmptyNewer],
  t0 + 8_000,
);
assert.equal(sameGenEmptyWins?.groups.length, 0, "same-gen newer empty must win");
assert.equal(
  selectLatestStoriesSnapshot(memoryNonEmpty, localEmptyNewer)?.groups.length,
  0,
);

const sameGenNewerFetchedEmpty = selectLatestStoriesSnapshot(
  { viewerUid: "viewer_a", generation: 4, groups: [group], fetchedAtMs: t0, persistedAtMs: t0 },
  { viewerUid: "viewer_a", generation: 4, groups: [], fetchedAtMs: t0 + 9_000, persistedAtMs: t0 + 9_000 },
);
assert.equal(sameGenNewerFetchedEmpty?.groups.length, 0, "same-gen newer fetched empty wins");

const tooManyGroups = Array.from({ length: 41 }, (_, i) => ({
  ownerUid: `o_${i}`,
  stories: Array.from({ length: i === 0 ? 21 : 1 }, (__, j) => ({ id: `s_${i}_${j}` })),
}));
assert.equal(didTruncateStoriesSnapshot(tooManyGroups), true);
assert.equal(
  didTruncateStoriesSnapshot([{ ownerUid: "o", stories: [{ id: "s" }] }]),
  false,
);
assert.equal(didTruncateStoriesSnapshot([]), false, "empty complete is not truncated");

console.log(JSON.stringify({
  gate: "STORIES_SNAPSHOT_TTL",
  pass: true,
  cases: [
    "fetched_vs_persisted",
    "local_ack_keeps_fetchedAt",
    "empty_tombstone",
    "viewer_isolation",
    "no_empty_over_newer_gen",
    "same_gen_newer_empty_wins",
    "same_gen_newer_fetched_empty",
    "truncate_41_21",
  ],
}, null, 2));
