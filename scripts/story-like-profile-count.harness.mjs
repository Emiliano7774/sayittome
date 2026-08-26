/**
 * STORY_LIKE_PROFILE_COUNT — callable path + idempotent reconcile plan.
 *   node scripts/story-like-profile-count.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fnSrc = fs.readFileSync(path.join(root, "functions/src/storyLike.ts"), "utf8");
const indexSrc = fs.readFileSync(path.join(root, "functions/src/index.ts"), "utf8");
const clientSrc = fs.readFileSync(path.join(root, "src/lib/likes/storyLike.ts"), "utf8");
const viewerSrc = fs.readFileSync(
  path.join(root, "src/components/stories/StoryViewer.tsx"),
  "utf8",
);

assert.match(fnSrc, /runTransaction/);
assert.match(fnSrc, /likesPerfilCount/);
assert.match(fnSrc, /likedBy/);
assert.match(fnSrc, /FieldValue\.increment/);
assert.match(indexSrc, /toggleStoryLike/);
assert.match(clientSrc, /httpsCallable/);
assert.match(clientSrc, /toggleStoryLike/);
assert.match(viewerSrc, /toggleStoryLike\(/);
assert.doesNotMatch(viewerSrc, /likeCount: increment\(/);

const reconcile = await import(
  pathToFileURL(path.join(root, "scripts/reconcile-story-profile-likes.mjs")).href
);

const plan = reconcile.buildStoryProfileLikeReconcilePlan({
  stories: [
    {
      id: "s1",
      ownerUid: "owner1",
      likedBy: { a: true, b: true, owner1: true },
    },
    { id: "s2", ownerUid: "owner1", likedBy: { a: true } },
  ],
  profileCounts: { owner1: 5 },
  existingStoryLikes: [
    { source: "story", fromUid: "a", targetUid: "owner1", storyId: "s1" },
  ],
});

assert.equal(plan.expectedPairCount, 3); // a-s1, b-s1, a-s2
assert.equal(plan.missing.length, 2);
assert.equal(plan.ownerDeltas.length, 1);
assert.equal(plan.ownerDeltas[0].delta, 2);
assert.equal(plan.ownerDeltas[0].nextLikesPerfilCount, 7);

const idempotent = reconcile.buildStoryProfileLikeReconcilePlan({
  stories: [{ id: "s1", ownerUid: "o", likedBy: { x: true } }],
  profileCounts: { o: 1 },
  existingStoryLikes: [
    { source: "story", fromUid: "x", targetUid: "o", storyId: "s1" },
  ],
});
assert.equal(idempotent.writes, 0);

const reconcileSrc = fs.readFileSync(
  path.join(root, "scripts/reconcile-story-profile-likes.mjs"),
  "utf8",
);
assert.match(reconcileSrc, /--confirm/);
assert.match(reconcileSrc, /dry-run|dry-run-sample/);
assert.match(reconcileSrc, /backups/);

console.log("PASS story-like-profile-count");
