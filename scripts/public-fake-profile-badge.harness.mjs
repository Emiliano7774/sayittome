/**
 * PUBLIC_FAKE_PROFILE_BADGE — red PERFIL FALSO badge for everyone when tagged.
 *   node scripts/public-fake-profile-badge.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const tagSrc = fs.readFileSync(
  path.join(root, "src/components/profile/ProfileModerationTag.tsx"),
  "utf8",
);
const classic = fs.readFileSync(
  path.join(root, "src/components/shuffle/ClassicShuffleProfileRow.tsx"),
  "utf8",
);
const modern = fs.readFileSync(
  path.join(root, "src/components/modern/ModernShuffleCard.tsx"),
  "utf8",
);
const publicClassic = fs.readFileSync(
  path.join(root, "src/app/u/[username]/page.tsx"),
  "utf8",
);
const publicModern = fs.readFileSync(
  path.join(root, "src/components/modern/ModernPublicProfile.tsx"),
  "utf8",
);
const messages = fs.readFileSync(path.join(root, "src/lib/i18n/messages.ts"), "utf8");

assert.match(tagSrc, /tag === "fake"|value === "fake"/);
assert.match(tagSrc, /profile_moderation_fake_title/);
assert.match(tagSrc, /profile_moderation_fake_hint/);
assert.match(tagSrc, /border-rose-400/);
assert.match(tagSrc, /roleplay/);
assert.match(messages, /Administración verificó que este perfil de Instagram es falso/);

for (const src of [classic, modern, publicClassic, publicModern]) {
  assert.match(src, /ProfileModerationTag/);
  assert.match(src, /fakeProfileTag === "fake"/);
  assert.match(src, /tag="fake"|tag=\{?"fake"?\}/);
}

// Hierarchy: roleplay before fake in each surface that shows both.
for (const src of [classic, modern, publicClassic, publicModern]) {
  const roleplayIdx = src.indexOf('tag="roleplay"') >= 0
    ? src.indexOf('tag="roleplay"')
    : src.indexOf("profile.moderationTag");
  const fakeIdx = src.indexOf('tag="fake"');
  assert.ok(fakeIdx > 0, "fake badge present");
  if (roleplayIdx >= 0) {
    assert.ok(roleplayIdx < fakeIdx, "roleplay badge above fake badge");
  }
}

assert.match(classic, /AdminProfileFakeButton/);
assert.match(modern, /AdminProfileFakeButton/);

console.log("PASS public-fake-profile-badge");
