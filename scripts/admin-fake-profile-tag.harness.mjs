/**
 * ADMIN_FAKE_PROFILE_TAG — independent of roleplay; authed backend only.
 *   node scripts/admin-fake-profile-tag.harness.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const mod = await import(
  pathToFileURL(path.join(root, "src/lib/admin/usuarioModerationTagAdmin.ts")).href
);

const routeSrc = fs.readFileSync(path.join(root, "src/app/api/admin/action/route.ts"), "utf8");
const buttonSrc = fs.readFileSync(
  path.join(root, "src/components/profile/AdminProfileFakeButton.tsx"),
  "utf8",
);
const roleplaySrc = fs.readFileSync(
  path.join(root, "src/components/profile/AdminProfileRoleplayButton.tsx"),
  "utf8",
);
const rulesSrc = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const reportsSrc = fs.readFileSync(
  path.join(root, "src/components/admin/panels/AdminReportsPanel.tsx"),
  "utf8",
);
const classicShuffle = fs.readFileSync(
  path.join(root, "src/components/shuffle/ClassicShuffleProfileRow.tsx"),
  "utf8",
);
const modernShuffle = fs.readFileSync(
  path.join(root, "src/components/modern/ModernShuffleCard.tsx"),
  "utf8",
);
const publicProfile = fs.readFileSync(
  path.join(root, "src/app/u/[username]/page.tsx"),
  "utf8",
);

assert.match(routeSrc, /tag_fake_profile/);
assert.match(routeSrc, /clear_fake_profile_tag/);
assert.match(routeSrc, /verifyAdminIdToken/);
assert.match(buttonSrc, /AdminProfileFakeButton/);
assert.match(buttonSrc, /tag_fake_profile/);
assert.match(buttonSrc, /clear_fake_profile_tag/);
assert.match(buttonSrc, /postAdminAction/);
assert.doesNotMatch(buttonSrc, /setDoc|updateDoc|patchFirestoreDoc\(/);
assert.match(roleplaySrc, /tag_roleplay/);
assert.match(rulesSrc, /fakeProfileTag/);
assert.match(rulesSrc, /touchesModerationTags/);
assert.match(reportsSrc, /tag_fake_profile/);
assert.match(reportsSrc, /clear_fake_profile_tag/);
assert.match(classicShuffle, /AdminProfileFakeButton/);
assert.match(modernShuffle, /AdminProfileFakeButton/);
assert.match(publicProfile, /AdminProfileFakeButton/);
assert.match(classicShuffle, /AdminProfileRoleplayButton/);

const UID = "user_fake_abc";
const ADMIN = "admin@sayittome.app";

function makeDeps({ store = new Map() } = {}) {
  const writes = [];
  if (!store.has(UID)) store.set(UID, { username: "demo", moderationTag: "roleplay" });
  return {
    writes,
    store,
    deps: {
      getUsuarioRef: (uid) => ({
        get: async () => ({ exists: store.has(uid) }),
        update: async (patch) => {
          writes.push({ uid, patch });
          const prev = { ...(store.get(uid) || {}) };
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) delete prev[key];
            else prev[key] = value;
          }
          store.set(uid, prev);
        },
      }),
      serverTimestamp: () => ({ __sv: true }),
      deleteField: () => undefined,
    },
  };
}

{
  const { writes, store, deps } = makeDeps();
  const result = await mod.applyUsuarioModerationTagAdmin({
    uid: UID,
    adminEmail: ADMIN,
    action: "tag_fake_profile",
    note: "trucho",
    deps,
  });
  assert.equal(result.ok, true);
  assert.equal(writes[0].patch.fakeProfileTag, "fake");
  assert.equal(store.get(UID).fakeProfileTag, "fake");
  // Independent: roleplay must survive
  assert.equal(store.get(UID).moderationTag, "roleplay");
}

{
  const { writes, store, deps } = makeDeps();
  store.set(UID, {
    moderationTag: "roleplay",
    fakeProfileTag: "fake",
    fakeProfileTagNote: "x",
    fakeProfileTagAt: "t",
    fakeProfileTagBy: ADMIN,
  });
  await mod.applyUsuarioModerationTagAdmin({
    uid: UID,
    adminEmail: ADMIN,
    action: "clear_fake_profile_tag",
    deps,
  });
  assert.equal(writes[0].patch.fakeProfileTag, undefined);
  assert.equal(store.get(UID).fakeProfileTag, undefined);
  assert.equal(store.get(UID).moderationTag, "roleplay");
}

{
  const { store, deps } = makeDeps();
  await mod.applyUsuarioModerationTagAdmin({
    uid: UID,
    adminEmail: ADMIN,
    action: "tag_fake_profile",
    deps,
  });
  await mod.applyUsuarioModerationTagAdmin({
    uid: UID,
    adminEmail: ADMIN,
    action: "clear_moderation_tag",
    deps,
  });
  assert.equal(store.get(UID).fakeProfileTag, "fake");
  assert.equal(store.get(UID).moderationTag, undefined);
}

console.log("PASS admin-fake-profile-tag");
