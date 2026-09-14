/**
 * PUBLIC_FAKE_PROFILE_BADGE — ProfileModerationBadges aggregator on all public/Shuffle surfaces.
 *   node --experimental-strip-types scripts/public-fake-profile-badge.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const badgesSrc = fs.readFileSync(
  path.join(root, "src/components/profile/ProfileModerationBadges.tsx"),
  "utf8",
);
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

// Aggregator: roleplay before fake (order is product conduct).
const roleplayLine = badgesSrc.indexOf('legacy === "roleplay" ? "roleplay"');
const fakeLine = badgesSrc.indexOf('fakeProfileTag === "fake" ? "fake"');
assert.ok(roleplayLine >= 0, "aggregator must resolve roleplay");
assert.ok(fakeLine >= 0, "aggregator must resolve fake");
assert.ok(roleplayLine < fakeLine, "roleplay must precede fake in ProfileModerationBadges");
assert.match(badgesSrc, /ProfileModerationTag/);
assert.match(badgesSrc, /tags\.map\(\(tag\)/);

// Fake badge visuals + copy still live in the tag renderer used by the aggregator.
assert.match(tagSrc, /value === "fake"|kind === "fake"/);
assert.match(tagSrc, /profile_moderation_fake_title/);
assert.match(tagSrc, /profile_moderation_fake_hint/);
assert.match(tagSrc, /border-rose-400/);
assert.match(messages, /Administración verificó que este perfil de Instagram es falso/);

const surfaces = [
  ["classic-shuffle", classic],
  ["modern-shuffle", modern],
  ["public-classic", publicClassic],
  ["public-modern", publicModern],
];

for (const [label, src] of surfaces) {
  assert.match(src, /ProfileModerationBadges/, `${label} must use ProfileModerationBadges`);
  assert.match(src, /moderationTag=\{profile\.moderationTag\}/, `${label} passes moderationTag`);
  assert.match(src, /fakeProfileTag=\{profile\.fakeProfileTag\}/, `${label} passes fakeProfileTag`);
  assert.doesNotMatch(
    src,
    /import\s+ProfileModerationTag\s+from/,
    `${label} must not import ProfileModerationTag directly`,
  );
  assert.doesNotMatch(
    src,
    /<ProfileModerationTag[\s\S]*?tag=["']fake["']/,
    `${label} must not mount fake tag outside aggregator`,
  );
}

assert.match(classic, /AdminProfileFakeButton/);
assert.match(modern, /AdminProfileFakeButton/);

console.log(
  JSON.stringify({
    gate: "PUBLIC_FAKE_PROFILE_BADGE",
    pass: true,
    aggregator: "ProfileModerationBadges",
    order: "roleplay_before_fake",
  }),
);
