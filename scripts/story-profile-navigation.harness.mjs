/** STORY_PROFILE_NAVIGATION */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const viewer = fs.readFileSync(
  path.join(root, "src/components/stories/StoryViewer.tsx"),
  "utf8",
);
const resolver = fs.readFileSync(
  path.join(root, "src/lib/stories/storyProfileNavigation.ts"),
  "utf8",
);
const route = fs.readFileSync(
  path.join(root, "src/app/api/profile/resolve-uid/route.ts"),
  "utf8",
);

assert.match(viewer, /resolveStoryProfileUsername/);
assert.match(
  viewer,
  /const stableOwnerUid = String\(current\?\.ownerUid \|\| resolvedOwnerUid \|\| ""\)\.trim\(\)/,
);
assert.match(
  viewer,
  /ownerUid: stableOwnerUid/,
);
assert.match(resolver, /\/api\/profile\/resolve-uid\?uid=/);
assert.match(resolver, /never navigate using a potentially stale/);
assert.match(route, /await import\(/);
assert.match(route, /collection\("usuarios"\)\.doc\(uid\)\.get\(\)/);
assert.match(route, /isPublicProfile\(data\)/);
assert.match(viewer, /fastRouterPush\(router, `\/u\/\$\{encodeURIComponent\(username\)\}`\)/);
assert.doesNotMatch(viewer, /router\.push\(`\/u\/\$\{encodeURIComponent\(profileUsername\)\}`\)/);

console.log(JSON.stringify({ gate: "STORY_PROFILE_NAVIGATION", pass: true }, null, 2));
