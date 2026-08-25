/**
 * Runs inside `firebase emulators:exec --only firestore`.
 * Matrix: viewOnceSecrets DENY; chats meta+mensajes ALLOW (catch-all);
 * no client forge of secrets / mediaUrl via secrets collection.
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

  // Owner profile writes use usuarios/{uid} rules (not catch-all).
  await assertSucceeds(
    authed.firestore().doc("usuarios/user_abc").set({ displayName: "ok" }, { merge: true }),
  );
  // Unauthenticated cannot write usuarios (catch-all excluded).
  await assertFails(
    anon.firestore().doc("usuarios/user_abc").set({ displayName: "evil" }, { merge: true }),
  );

  // Product writer path: new + existing chat meta + media/text/audio/bomb birth.
  const visitor = testEnv.authenticatedContext("anon_fb_visitor");
  const chatId = "anon_visitor__profileuser";
  const chatRef = visitor.firestore().doc(`chats/${chatId}`);
  await assertSucceeds(
    chatRef.set(
      {
        participantes: ["anon_visitor", "anon_fb_visitor", "owner_uid"],
        anon: true,
        schemaVersion: 2,
      },
      { merge: true },
    ),
  );

  const cases = [
    { id: "text_new", type: "text", texto: "hola", viewOnce: false },
    {
      id: "gallery_photo",
      type: "image",
      texto: "",
      mediaUrl: "https://cdn.example/g.jpg",
      source: "gallery",
      viewOnce: false,
    },
    {
      id: "camera_video",
      type: "video",
      texto: "",
      mediaUrl: "https://cdn.example/c.mp4",
      source: "camera",
      viewOnce: false,
    },
    {
      id: "audio",
      type: "audio",
      texto: "",
      mediaUrl: "https://cdn.example/a.webm",
      source: "audio",
      viewOnce: false,
    },
    {
      id: "bomb_1",
      type: "image",
      texto: "",
      source: "camera",
      viewOnce: true,
      viewOnceLimit: 1,
      viewOnceOpenedCount: 0,
      viewOnceExhausted: false,
      viewOnceSealed: false,
      // no mediaUrl on public birth
    },
    {
      id: "bomb_5",
      type: "image",
      texto: "",
      source: "camera",
      viewOnce: true,
      viewOnceLimit: 5,
      viewOnceOpenedCount: 0,
      viewOnceExhausted: false,
      viewOnceSealed: false,
    },
  ];

  for (const row of cases) {
    const { id, ...payload } = row;
    await assertSucceeds(
      visitor.firestore().doc(`chats/${chatId}/mensajes/${id}`).set({
        fromUid: "anon_visitor",
        createdByAuthUid: "anon_fb_visitor",
        senderAuthUid: "anon_fb_visitor",
        ...payload,
      }),
    );
  }

  // Existing chat update (merge) still allowed.
  await assertSucceeds(
    chatRef.set({ lastMessage: "📷" }, { merge: true }),
  );

  // Client must not write secrets collection (forgery path).
  await assertFails(
    visitor.firestore().doc(`viewOnceSecrets/${chatId}__bomb_1`).set({
      mediaUrl: "https://cdn.example/forged.jpg",
    }),
  );

  console.log(
    JSON.stringify(
      {
        gate: "VIEW_ONCE_SECRETS_RULES_EMULATOR",
        pass: true,
        clientDenied: true,
        adminAllowed: true,
        chatMediaWritesAllowed: true,
        cases: cases.map((c) => c.id),
      },
      null,
      2,
    ),
  );
} finally {
  await testEnv.cleanup();
}
