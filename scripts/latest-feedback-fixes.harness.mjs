/**
 * Regression gate for the 2026-10-07 feedback bundle.
 *   node scripts/latest-feedback-fixes.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const lifecycle = read("src/components/AnonSessionLifecycle.tsx");
assert.doesNotMatch(lifecycle, /markAnonSessionForReset/);
assert.doesNotMatch(lifecycle, /beginFreshAnonSession/);
assert.doesNotMatch(lifecycle, /deleteAnonymousStoriesForSession/);

const matchContext = read("src/contexts/AnonMatchContext.tsx");
assert.match(matchContext, /anon_match_identity_timeout/);
assert.match(matchContext, /anon_match_accept_timeout/);
assert.match(matchContext, /anon_match_reject_timeout/);
assert.match(matchContext, /anon_match_dnd_timeout/);
assert.match(matchContext, /finally \{\s*respondingIncomingRef\.current = false/);

const likeClient = read("src/lib/likes/storyLike.ts");
const likeServer = read("functions/src/storyLike.ts");
const storyStore = read("src/lib/stories/storiesIndexStore.ts");
const viewer = read("src/components/stories/StoryViewer.tsx");
assert.match(likeClient, /desiredLiked/);
assert.match(likeClient, /while \(true\)/);
assert.match(likeServer, /typeof request\.data\?\.desiredLiked === "boolean"/);
assert.match(likeServer, /const likeDelta = nextLiked === wasLiked \? 0/);
assert.match(likeServer, /const nextCount = Math\.max\(0, prevCount \+ likeDelta\)/);
assert.match(likeServer, /const profileDelta = likeDelta/);
assert.match(storyStore, /export function patchStoryLikeLocally/);
assert.match(viewer, /persistStoryLike\(storyId, nextLiked\)/);
assert.doesNotMatch(viewer, /likeBusy/);

const evidence = read("src/components/admin/AdminEvidenceMedia.tsx");
const evidenceImage = read("src/components/admin/AdminEvidenceImage.tsx");
assert.match(evidence, /AdminEvidenceImage/);
assert.doesNotMatch(evidence, /target="_blank"/);
assert.match(evidenceImage, /createPortal/);
assert.match(evidenceImage, /max-h-\[calc\(100dvh/);
assert.match(evidenceImage, /document\.body\.style\.overflow = "hidden"/);
assert.match(evidenceImage, /event\.key === "Escape"/);

console.log("PASS latest-feedback-fixes");
