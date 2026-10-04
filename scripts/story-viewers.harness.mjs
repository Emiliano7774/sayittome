/**
 * Own-story viewers: likes first by arrival, then others, no self-reply.
 *   node scripts/story-viewers.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viewers = await import(
  pathToFileURL(path.join(root, "src/lib/stories/storyViewers.ts")).href
);

assert.equal(viewers.canReplyToStory({ isOwner: true, anonymousStory: false, hasUsername: true }), false);
assert.equal(viewers.canReplyToStory({ isOwner: false, anonymousStory: false, hasUsername: true }), true);
assert.equal(viewers.canReplyToStory({ isOwner: false, anonymousStory: true, hasUsername: true }), false);

assert.equal(viewers.formatStoryViewerLocation({ pais: "AR", countryName: "Argentina", provincia: "Buenos Aires" }), "Buenos Aires, Argentina");
assert.equal(viewers.formatStoryViewerLocation({ countryName: "Argentina" }), "Argentina");

const ids = viewers.collectStoryViewerIds({
  ownerUid: "me",
  viewedBy: { me: true, u1: true },
  viewedByAnon: { anon_1: true },
  likedBy: { u2: true, me: true },
});
assert.deepEqual(ids.sort(), ["anon_1", "u1", "u2"]);

const rows = viewers.mergeStoryViewerRows([
  { id: "lateLike", liked: true, likedAtMs: 300, viewedAtMs: 50, kind: "profile", username: "b" },
  { id: "firstLike", liked: true, likedAtMs: 100, viewedAtMs: 10, kind: "profile", username: "a" },
  { id: "viewer", liked: false, viewedAtMs: 400, kind: "anon" },
  { id: "olderViewer", liked: false, viewedAtMs: 200, kind: "profile", username: "c" },
]);
assert.equal(rows[0].id, "firstLike");
assert.equal(rows[1].id, "lateLike");
assert.equal(rows[2].id, "viewer");
assert.equal(rows[3].id, "olderViewer");

const src = fs.readFileSync(path.join(root, "src/components/stories/StoryViewer.tsx"), "utf8");
assert.match(src, /StoryViewersSheet/);
assert.match(src, /canReplyToStory/);
assert.match(src, /setViewersOpen\(true\)/);
assert.match(src, /shouldOpenStoryViewersGesture/);
assert.match(src, /data-story-gesture-layer/);
assert.match(src, /data-story-viewers-peek/);
assert.match(src, /shouldCloseStoryViewersGesture/);
assert.doesNotMatch(src, /canReply = \s*\n\s*!anonymousStory/);
const sheet = fs.readFileSync(path.join(root, "src/components/stories/StoryViewersSheet.tsx"), "utf8");
assert.match(sheet, /data-story-viewers-scroll/);
assert.match(sheet, /data-story-viewers-handle/);
assert.match(sheet, /shouldCloseStoryViewersGesture/);
assert.match(sheet, /overflow-y-auto/);
const likeFn = fs.readFileSync(path.join(root, "functions/src/storyLike.ts"), "utf8");
assert.match(likeFn, /collection\("vistas"\)/);

console.log("PASS story-viewers");
