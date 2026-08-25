/**
 * ADMIN_USUARIO_MODERATION_TAG
 * Product-importing: tag/clear via Bearer-authed REST; never API-key-only.
 * Authority = verified admin email + idToken for rules isAdmin().
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
const restSrc = fs.readFileSync(path.join(root, "src/lib/firestore/rest.ts"), "utf8");
const rulesSrc = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

assert.match(routeSrc, /verifyAdminIdToken/);
assert.match(routeSrc, /void body/);
assert.match(routeSrc, /applyUsuarioModerationTagAdmin/);
assert.match(routeSrc, /idToken/);
assert.match(helperSrc, /import "server-only"/);
assert.match(helperSrc, /createAuthedRestUsuarioModerationTagDeps/);
assert.match(helperSrc, /patchFirestoreDocAuthed/);
assert.doesNotMatch(helperSrc, /getRepairAdminDb/);
assert.doesNotMatch(helperSrc, /await patchFirestoreDoc\(/);
assert.match(restSrc, /export async function patchFirestoreDocAuthed/);
assert.match(restSrc, /Authorization:\s*`Bearer \$\{token\}`/);
assert.match(rulesSrc, /collection != 'usuarios'/);
assert.match(rulesSrc, /touchesModerationTags/);
assert.match(rulesSrc, /isAdmin\(\)/);
assert.doesNotMatch(helperSrc, /\^\[A-Za-z0-9_-\]\{6,128\}/);
assert.match(helperSrc, /uid\.length < 1 \|\| uid\.length > 128/);
const tagSlice = routeSrc.slice(
  routeSrc.indexOf("tag_roleplay"),
  routeSrc.indexOf("toggle_media_blur"),
);
assert.match(tagSlice, /idToken/);
assert.doesNotMatch(tagSlice, /body\?\.adminEmail|body\.adminEmail/);
assert.match(buttonSrc, /admin_tag_roleplay_fail/);
assert.match(buttonSrc, /admin_clear_roleplay_tag_fail/);

const UID = "user_abc123xyz";
const ADMIN = "admin@sayittome.app";

function makeDeps({ exists = true, failWrite = false, store = new Map() } = {}) {
  const writes = [];
  if (exists && !store.has(UID)) {
    store.set(UID, { username: "demo" });
  }
  const serverTimestampToken = { __sv: true };
  const deleteToken = undefined;
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
            if (value === undefined) delete prev[key];
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
  assert.equal(writes[0].patch.moderationTag, "roleplay");
  assert.equal(writes[0].patch.moderationTagAt, serverTimestampToken);
  assert.equal(store.get(UID).moderationTag, "roleplay");
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
}

// --- missing idToken without deps ---
{
  await assert.rejects(
    () =>
      mod.applyUsuarioModerationTagAdmin({
        uid: UID,
        adminEmail: ADMIN,
        action: "tag_roleplay",
      }),
    (err) => err.code === "missing_id_token" && err.status === 401,
  );
}

// --- uid validation ---
{
  assert.equal(mod.assertExactUsuarioUid("a"), "a");
  for (const bad of ["", "  x", "a/b", "a\\b", "a\nb"]) {
    assert.throws(
      () => mod.assertExactUsuarioUid(bad),
      (err) => err.code === "invalid_uid",
    );
  }
}

// --- not admin — body adminEmail must not authorize ---
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
  assert.equal(writes.length, 1);
}

// --- live: requires ADMIN_ID_TOKEN; asserts naked API-key write denied after rules ---
let live = null;
if (String(process.env.ADMIN_TAG_LIVE || "").trim() === "1") {
  const liveUid = String(process.env.PROBE_UID || "7PyiJnCsWGRQZVF7l7LcRFzblMo2").trim();
  const adminEmail = "emilianomaturano@gmail.com";
  const idToken = String(process.env.ADMIN_ID_TOKEN || "").trim();
  assert.ok(idToken, "ADMIN_TAG_LIVE=1 requires ADMIN_ID_TOKEN (verified admin bearer)");

  const { patchFirestoreDoc, getFirestoreDoc } = await import(
    pathToFileURL(path.join(root, "src/lib/firestore/rest.ts")).href
  );

  let nakedDenied = false;
  try {
    await patchFirestoreDoc("usuarios", liveUid, {
      moderationTag: "roleplay",
      moderationTagNote: "naked_api_key_must_fail",
    });
  } catch {
    nakedDenied = true;
  }
  assert.equal(nakedDenied, true, "API-key-only usuarios write must be denied by rules");

  const deps = await mod.createAuthedRestUsuarioModerationTagDeps(idToken);
  const tagged = await mod.applyUsuarioModerationTagAdmin({
    uid: liveUid,
    adminEmail,
    idToken,
    action: "tag_roleplay",
    note: "harness_live_authed_rest",
    deps,
  });
  assert.equal(tagged.ok, true);
  const afterTag = await getFirestoreDoc("usuarios", liveUid);
  assert.equal(afterTag.moderationTag, "roleplay");

  await mod.applyUsuarioModerationTagAdmin({
    uid: liveUid,
    adminEmail,
    idToken,
    action: "clear_moderation_tag",
    deps,
  });
  const afterClear = await getFirestoreDoc("usuarios", liveUid);
  assert.equal(afterClear.moderationTag, undefined);

  live = {
    uid: liveUid,
    writer: "firestore_rest_authed",
    nakedApiKeyDenied: true,
    tagged: true,
    cleared: true,
  };
}

console.log(
  JSON.stringify(
    {
      gate: "ADMIN_USUARIO_MODERATION_TAG",
      pass: true,
      productiveWriter: "firestore_rest_authed_bearer",
      live,
    },
    null,
    2,
  ),
);
