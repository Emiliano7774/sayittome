/**
 * ADMIN_USUARIO_MODERATION_TAG
 * Product-importing: tag/clear via Admin SDK helper; invalid uid / no admin / writer fail.
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
  path.join(root, "src/components/profile/AdminProfileRoleplayButton.tsx"),
  "utf8",
);
const helperSrc = fs.readFileSync(
  path.join(root, "src/lib/admin/usuarioModerationTagAdmin.ts"),
  "utf8",
);

assert.match(routeSrc, /verifyAdminIdToken/);
assert.match(routeSrc, /void body/);
assert.match(routeSrc, /applyUsuarioModerationTagAdmin/);
assert.match(helperSrc, /import "server-only"/);
assert.match(helperSrc, /getRepairAdminDb/);
assert.match(helperSrc, /serverTimestamp/);
assert.match(helperSrc, /FieldValue\.delete|deleteField/);
assert.doesNotMatch(helperSrc, /\^\[A-Za-z0-9_-\]\{6,128\}/);
assert.match(helperSrc, /uid\.length < 1 \|\| uid\.length > 128/);
const tagSlice = routeSrc.slice(
  routeSrc.indexOf("tag_roleplay"),
  routeSrc.indexOf("toggle_media_blur"),
);
assert.doesNotMatch(tagSlice, /patchFirestoreDoc\(\s*"usuarios"/);
assert.doesNotMatch(tagSlice, /body\?\.adminEmail|body\.adminEmail/);
assert.match(buttonSrc, /admin_tag_roleplay_fail/);
assert.match(buttonSrc, /admin_clear_roleplay_tag_fail/);
assert.match(buttonSrc, /} catch \{/);
assert.doesNotMatch(buttonSrc, /alert\(t\("admin_undo_fail"\)\)/);

const UID = "user_abc123xyz";
const ADMIN = "admin@sayittome.app";

function makeDeps({ exists = true, failWrite = false, store = new Map() } = {}) {
  const writes = [];
  if (exists && !store.has(UID)) {
    store.set(UID, { username: "demo" });
  }
  const serverTimestampToken = { __sv: true };
  const deleteToken = { __del: true };
  return {
    writes,
    store,
    deps: {
      getUsuarioRef: (uid) => ({
        get: async () => ({ exists: store.has(uid) }),
        update: async (patch) => {
          writes.push({ uid, patch });
          if (failWrite) throw new Error("permission-denied");
          const prev = { ...(store.get(uid) || {}) };
          for (const [key, value] of Object.entries(patch)) {
            if (value === deleteToken) delete prev[key];
            else prev[key] = value;
          }
          store.set(uid, prev);
        },
      }),
      serverTimestamp: () => serverTimestampToken,
      deleteField: () => deleteToken,
    },
    serverTimestampToken,
    deleteToken,
  };
}

// --- tag ---
{
  const { writes, store, deps, serverTimestampToken } = makeDeps();
  const result = await mod.applyUsuarioModerationTagAdmin({
    uid: UID,
    adminEmail: ADMIN,
    action: "tag_roleplay",
    note: "nota",
    deps,
  });
  assert.equal(result.ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].patch.moderationTag, "roleplay");
  assert.equal(writes[0].patch.moderationTagNote, "nota");
  assert.equal(writes[0].patch.moderationTagBy, ADMIN);
  assert.equal(writes[0].patch.moderationTagAt, serverTimestampToken);
  assert.equal(store.get(UID).moderationTag, "roleplay");

  // idempotent retag
  await mod.applyUsuarioModerationTagAdmin({
    uid: UID,
    adminEmail: ADMIN,
    action: "tag_roleplay",
    deps,
  });
  assert.equal(writes.length, 2);
}

// --- clear ---
{
  const { writes, store, deps, deleteToken } = makeDeps();
  store.set(UID, {
    moderationTag: "roleplay",
    moderationTagNote: "x",
    moderationTagAt: "t",
    moderationTagBy: ADMIN,
  });
  const result = await mod.applyUsuarioModerationTagAdmin({
    uid: UID,
    adminEmail: ADMIN,
    action: "clear_moderation_tag",
    deps,
  });
  assert.equal(result.ok, true);
  assert.equal(writes[0].patch.moderationTag, deleteToken);
  assert.equal(store.get(UID).moderationTag, undefined);

  // idempotent clear on already-cleared doc
  await mod.applyUsuarioModerationTagAdmin({
    uid: UID,
    adminEmail: ADMIN,
    action: "clear_moderation_tag",
    deps,
  });
  assert.equal(writes.length, 2);
}

// --- uid validation: short + dotted valid; slash/control/padded invalid ---
{
  assert.equal(mod.assertExactUsuarioUid("a"), "a");
  assert.equal(mod.assertExactUsuarioUid("u.v"), "u.v");
  assert.equal(mod.assertExactUsuarioUid("ab.cd-1"), "ab.cd-1");

  for (const bad of ["", "  x", "x  ", "a/b", "a\\b", "a\nb", "a\u0000b"]) {
    assert.throws(
      () => mod.assertExactUsuarioUid(bad),
      (err) => err.code === "invalid_uid" && err.status === 400,
    );
  }

  const shortUid = "ab";
  const dottedUid = "user.local-1";
  for (const okUid of [shortUid, dottedUid]) {
    const { writes, store, deps } = makeDeps({ exists: false });
    store.set(okUid, { username: "ok" });
    const result = await mod.applyUsuarioModerationTagAdmin({
      uid: okUid,
      adminEmail: ADMIN,
      action: "tag_roleplay",
      deps,
    });
    assert.equal(result.ok, true);
    assert.equal(result.uid, okUid);
    assert.equal(writes.length, 1);
    assert.equal(store.get(okUid).moderationTag, "roleplay");
  }
}

// --- invalid uid (padded / empty) must not write ---
{
  const { writes, deps } = makeDeps();
  await assert.rejects(
    () =>
      mod.applyUsuarioModerationTagAdmin({
        uid: "  bad  ",
        adminEmail: ADMIN,
        action: "tag_roleplay",
        deps,
      }),
    (err) => err.code === "invalid_uid" && err.status === 400,
  );
  await assert.rejects(
    () =>
      mod.applyUsuarioModerationTagAdmin({
        uid: "",
        adminEmail: ADMIN,
        action: "tag_roleplay",
        deps,
      }),
    (err) => err.code === "invalid_uid" && err.status === 400,
  );
  await assert.rejects(
    () =>
      mod.applyUsuarioModerationTagAdmin({
        uid: "path/../escape",
        adminEmail: ADMIN,
        action: "tag_roleplay",
        deps,
      }),
    (err) => err.code === "invalid_uid" && err.status === 400,
  );
  assert.equal(writes.length, 0);
}

// --- user not found ---
{
  const { writes, store, deps } = makeDeps({ exists: false });
  store.clear();
  const mapped = await mod.runAuthenticatedUsuarioModerationTagAction({
    verifiedAdmin: { email: ADMIN },
    uid: UID,
    action: "tag_roleplay",
    deps,
  });
  assert.equal(mapped.status, 404);
  assert.equal(mapped.body.error, "user_not_found");
  assert.equal(writes.length, 0);
}

// --- not admin (no verified token) — body adminEmail must not authorize ---
{
  const { writes, deps } = makeDeps();
  const mapped = await mod.runAuthenticatedUsuarioModerationTagAction({
    verifiedAdmin: null,
    uid: UID,
    action: "tag_roleplay",
    bodyAdminEmail: ADMIN,
    deps,
  });
  assert.equal(mapped.status, 403);
  assert.equal(mapped.body.error, "forbidden");
  assert.equal(writes.length, 0);
}

// --- writer failure ---
{
  const { writes, deps } = makeDeps({ failWrite: true });
  const mapped = await mod.runAuthenticatedUsuarioModerationTagAction({
    verifiedAdmin: { email: ADMIN },
    uid: UID,
    action: "tag_roleplay",
    deps,
  });
  assert.equal(mapped.status, 500);
  assert.equal(mapped.body.error, "write_failed");
  assert.equal(writes.length, 1, "attempted write once then mapped failure");
}

console.log(JSON.stringify({ gate: "ADMIN_USUARIO_MODERATION_TAG", pass: true }, null, 2));
