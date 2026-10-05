/**
 * Modern profile: tap opens the story; a 3s hold opens the photo gallery.
 *   node scripts/profile-photo-hold.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hold = await import(
  pathToFileURL(path.join(root, "src/lib/profile/profilePhotoHold.ts")).href
);

assert.equal(hold.PROFILE_PHOTO_HOLD_MS, 3000);
assert.equal(hold.profilePhotoHoldOpensGallery(2999), false);
assert.equal(hold.profilePhotoHoldOpensGallery(3000), true);

const src = fs.readFileSync(
  path.join(root, "src/components/modern/ModernPublicProfile.tsx"),
  "utf8",
);
assert.match(src, /PROFILE_PHOTO_HOLD_MS/);
assert.match(src, /openProfilePhotos/);
assert.match(src, /story\.storyPath/);
assert.match(src, /onPointerDown=\{startPhotoHold\}/);
assert.match(src, /photoHoldOpenedRef/);

console.log("PASS profile-photo-hold");
