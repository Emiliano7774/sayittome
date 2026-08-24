/**
 * Runs inside `firebase emulators:exec --only firestore`.
 * Verifies client deny-all on viewOnceSecrets and Admin SDK write/read.
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

const testEnv = await initializeTestEnvironment({
  projectId: "demo-sayittome-viewonce",
  firestore: { rules, host: "127.0.0.1", port: 8080 },
});

const secretPath = "viewOnceSecrets/chatA__msgB";

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await assertSucceeds(
      adminDb.doc(secretPath).set({
        mediaUrl: "https://cdn.example/secret.jpg",
        chatId: "chatA",
        messageId: "msgB",
      }),
    );
    const snap = await adminDb.doc(secretPath).get();
    assert.equal(snap.exists, true);
    assert.equal(snap.data()?.mediaUrl, "https://cdn.example/secret.jpg");
  });

  const anon = testEnv.unauthenticatedContext();
  await assertFails(anon.firestore().doc(secretPath).get());
  await assertFails(
    anon.firestore().doc(secretPath).set({ mediaUrl: "https://evil" }),
  );
  await assertFails(anon.firestore().doc(secretPath).delete());

  const authed = testEnv.authenticatedContext("user_abc", {
    email: "someone@example.com",
  });
  await assertFails(authed.firestore().doc(secretPath).get());
  await assertFails(
    authed.firestore().doc(secretPath).set({ mediaUrl: "https://evil2" }),
  );
  await assertFails(authed.firestore().doc(secretPath).update({ x: 1 }));
  await assertFails(authed.firestore().doc(secretPath).delete());

  // Catch-all still allows unrelated docs (prod behavior preserved).
  await assertSucceeds(
    authed.firestore().doc("usuarios/user_abc").set({ displayName: "ok" }, { merge: true }),
  );

  console.log(
    JSON.stringify(
      {
        gate: "VIEW_ONCE_SECRETS_RULES_EMULATOR",
        pass: true,
        clientDenied: true,
        adminAllowed: true,
      },
      null,
      2,
    ),
  );
} finally {
  await testEnv.cleanup();
}
