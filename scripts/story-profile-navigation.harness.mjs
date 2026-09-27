/** STORY_PROFILE_NAVIGATION */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const viewer = fs.readFileSync(
  path.join(root, "src/components/stories/StoryViewer.tsx"),
  "utf8",
);

assert.match(viewer, /fetchProfileStoryIdentity/);
assert.match(
  viewer,
  /const stableOwnerUid = String\(current\?\.ownerUid \|\| resolvedOwnerUid \|\| ""\)\.trim\(\)/,
);
assert.match(
  viewer,
  /fetchProfileStoryIdentity\(stableOwnerUid, \{ force: true \}\)/,
);
assert.match(viewer, /username = currentUsername/);
assert.match(viewer, /fastRouterPush\(router, `\/u\/\$\{encodeURIComponent\(username\)\}`\)/);
assert.doesNotMatch(viewer, /router\.push\(`\/u\/\$\{encodeURIComponent\(profileUsername\)\}`\)/);

console.log(JSON.stringify({ gate: "STORY_PROFILE_NAVIGATION", pass: true }, null, 2));
