/**
 * Next play target: all-seen / mixed / replay.
 * Usage: node --experimental-strip-types scripts/stories-next-target.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  firstUnseenStoryIndex,
  resolveNextPlayTarget,
  shouldReplayStoryPlayback,
} = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storiesQueryGuard.ts")).href
);

const viewer = "uid_viewer";
const isUnseen = (story, viewerId) => story.unseen === true && Boolean(viewerId);
const groupIsUnseen = (group, viewerId) =>
  group.stories.some((story) => isUnseen(story, viewerId));

const allSeenGroup = {
  ownerUid: "owner_a",
  stories: [
    { id: "a1", unseen: false },
    { id: "a2", unseen: false },
    { id: "a3", unseen: false },
  ],
};
const mixedGroup = {
  ownerUid: "owner_b",
  stories: [
    { id: "b1", unseen: false },
    { id: "b2", unseen: true },
    { id: "b3", unseen: false },
  ],
};
const unseenGroup = {
  ownerUid: "owner_c",
  stories: [{ id: "c1", unseen: true }],
};
const groups = [allSeenGroup, mixedGroup, unseenGroup];

assert.equal(
  shouldReplayStoryPlayback({
    stories: allSeenGroup.stories,
    viewerId: viewer,
    isUnseen,
  }),
  true,
);
assert.equal(
  shouldReplayStoryPlayback({
    stories: mixedGroup.stories,
    viewerId: viewer,
    isUnseen,
  }),
  false,
);
assert.equal(
  shouldReplayStoryPlayback({
    stories: mixedGroup.stories,
    viewerId: viewer,
    initialStoryId: "b1",
    isUnseen,
  }),
  true,
  "opening an already-seen story locks replay",
);

const allSeenNext = resolveNextPlayTarget({
  viewerId: viewer,
  currentOwnerUid: "owner_a",
  currentIndex: 0,
  currentStories: allSeenGroup.stories,
  groups,
  replay: true,
  isUnseen,
  groupIsUnseen,
});
assert.equal(allSeenNext.kind, "same-group");
assert.equal(allSeenNext.storyIndex, 1);

const allSeenLast = resolveNextPlayTarget({
  viewerId: viewer,
  currentOwnerUid: "owner_a",
  currentIndex: 2,
  currentStories: allSeenGroup.stories,
  groups,
  replay: true,
  isUnseen,
  groupIsUnseen,
});
assert.equal(allSeenLast.kind, "next-group");
assert.equal(allSeenLast.group?.ownerUid, "owner_b");
assert.equal(allSeenLast.storyIndex, 1, "skip the already-seen story and open the new one");

const mixedNoReplay = resolveNextPlayTarget({
  viewerId: viewer,
  currentOwnerUid: "owner_b",
  currentIndex: 0,
  currentStories: mixedGroup.stories,
  groups,
  replay: false,
  isUnseen,
  groupIsUnseen,
});
assert.equal(mixedNoReplay.kind, "same-group");
assert.equal(mixedNoReplay.storyIndex, 1);

const mixedAfterUnseen = resolveNextPlayTarget({
  viewerId: viewer,
  currentOwnerUid: "owner_b",
  currentIndex: 1,
  currentStories: mixedGroup.stories,
  groups,
  replay: false,
  isUnseen,
  groupIsUnseen,
});
assert.equal(mixedAfterUnseen.kind, "same-group");
assert.equal(mixedAfterUnseen.storyIndex, 2);

const mixedReplaySeenInitial = resolveNextPlayTarget({
  viewerId: viewer,
  currentOwnerUid: "owner_b",
  currentIndex: 0,
  currentStories: mixedGroup.stories,
  groups,
  replay: true,
  isUnseen,
  groupIsUnseen,
});
assert.equal(mixedReplaySeenInitial.kind, "same-group");
assert.equal(mixedReplaySeenInitial.storyIndex, 1);

const mixedReplayEnd = resolveNextPlayTarget({
  viewerId: viewer,
  currentOwnerUid: "owner_b",
  currentIndex: 2,
  currentStories: mixedGroup.stories,
  groups,
  replay: true,
  isUnseen,
  groupIsUnseen,
});
assert.equal(mixedReplayEnd.kind, "next-group");
assert.equal(mixedReplayEnd.group?.ownerUid, "owner_c");
assert.equal(mixedReplayEnd.storyIndex, 0);

const lastOfFeed = resolveNextPlayTarget({
  viewerId: viewer,
  currentOwnerUid: "owner_c",
  currentIndex: 0,
  currentStories: unseenGroup.stories,
  groups,
  replay: false,
  isUnseen,
  groupIsUnseen,
});
assert.equal(lastOfFeed.kind, "exit");
const viewerSrc = fs.readFileSync(
  path.join(root, "src/components/stories/StoryViewer.tsx"),
  "utf8",
);
assert.match(viewerSrc, /viewerChanged && viewerUid && !initialStoryId/);
assert.match(viewerSrc, /initialStoryIndex\(stories, undefined, viewerUid\)/);
assert.equal(
  firstUnseenStoryIndex(mixedGroup.stories, viewer, isUnseen),
  1,
);

console.log(JSON.stringify({
  gate: "STORIES_NEXT_TARGET",
  pass: true,
  cases: ["consecutive_same_group", "consecutive_next_neighbor", "exit_only_at_feed_end"],
}, null, 2));
