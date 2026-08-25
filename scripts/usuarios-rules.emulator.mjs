/**
 * Runs inside `firebase emulators:exec --only firestore`.
 * USUARIOS_RULES matrix:
 * - owner: own profile fields OK; moderationTag* denied
 * - admin: moderationTag* (and general update) OK
 * - other user / no-auth: denied
 * - catch-all must not resurrect unauthenticated usuarios writes
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = readFileSync(path.join(root, "firestore.rules"), "utf8");
const ADMIN_EMAIL = "emilianomaturano@gmail.com";
const OWNER_UID = "owner_uid_abc";
const OTHER_UID = "other_uid_xyz";
const TARGET = `usuarios/${OWNER_UID}`;

const testEnv = await initializeTestEnvironment({
  projectId: "demo-sayittome-usuarios-rules",
  firestore: { rules, host: "127.0.0.1", port: 8080 },
});

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(TARGET).set({
      username: "owner",
      bio: "hola",
      email: "owner@example.com",
    });
  });

  const owner = testEnv.authenticatedContext(OWNER_UID, {
    email: "owner@example.com",
  });
  const other = testEnv.authenticatedContext(OTHER_UID, {
    email: "other@example.com",
  });
  const admin = testEnv.authenticatedContext("admin_uid", {
    email: ADMIN_EMAIL,
  });
  const anon = testEnv.unauthenticatedContext();

  // Owner: own compatible profile fields
  await assertSucceeds(owner.firestore().doc(TARGET).update({ bio: "nueva bio" }));
  await assertSucceeds(
    owner.firestore().doc(TARGET).update({ username: "owner2", provincia: "BA" }),
  );

  // Owner: cannot forge moderationTag*
  await assertFails(
    owner.firestore().doc(TARGET).update({ moderationTag: "roleplay" }),
  );
  await assertFails(
    owner.firestore().doc(TARGET).update({
      moderationTag: "roleplay",
      moderationTagNote: "self",
      moderationTagBy: ADMIN_EMAIL,
    }),
  );

  // Other user denied
  await assertFails(other.firestore().doc(TARGET).update({ bio: "hack" }));
  await assertFails(
    other.firestore().doc(TARGET).update({ moderationTag: "roleplay" }),
  );

  // No-auth denied (API-key-only REST equivalent)
  await assertFails(anon.firestore().doc(TARGET).update({ bio: "anon" }));
  await assertFails(
    anon.firestore().doc(TARGET).update({ moderationTag: "roleplay" }),
  );
  await assertFails(
    anon.firestore().doc(TARGET).set({ username: "forged" }, { merge: true }),
  );

  // Admin: moderationTag* OK
  await assertSucceeds(
    admin.firestore().doc(TARGET).update({
      moderationTag: "roleplay",
      moderationTagNote: "admin mark",
      moderationTagBy: ADMIN_EMAIL,
      moderationTagAt: new Date().toISOString(),
    }),
  );
  await assertSucceeds(
    admin.firestore().doc(TARGET).update({
      moderationTag: null,
      moderationTagNote: null,
      moderationTagAt: null,
      moderationTagBy: null,
    }),
  );

  // Admin: other moderation fields OK (compat with ban/blur path)
  await assertSucceeds(
    admin.firestore().doc(TARGET).update({
      banned: true,
      adminBlurProfilePhoto: true,
    }),
  );

  // Owner create without moderation tags
  const freshUid = "fresh_owner_1";
  const fresh = testEnv.authenticatedContext(freshUid, { email: "fresh@example.com" });
  await assertSucceeds(
    fresh.firestore().doc(`usuarios/${freshUid}`).set({ username: "fresh", bio: "" }),
  );
  await assertFails(
    fresh.firestore().doc(`usuarios/${freshUid}_x`).set({ username: "spoof" }),
  );
  await assertFails(
    fresh
      .firestore()
      .doc(`usuarios/${freshUid}_tag`)
      .set({ username: "x", moderationTag: "roleplay" }),
  );

  console.log(
    JSON.stringify(
      {
        gate: "USUARIOS_RULES_EMULATOR",
        pass: true,
        ownerProfileOk: true,
        ownerModerationDenied: true,
        adminModerationOk: true,
        noAuthDenied: true,
        otherUserDenied: true,
      },
      null,
      2,
    ),
  );
} finally {
  await testEnv.cleanup();
}
