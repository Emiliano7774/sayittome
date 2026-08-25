/**
 * Attack matrix for anon→profile block (runs inside firestore emulator).
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

const ANON = "anon_deadbeef01";
const PROFILE = "profileOwnerUid";
const CHAT_ID = `${ANON}__anon_to__alice`;
const OTHER = "attackerUid";

const testEnv = await initializeTestEnvironment({
  projectId: "demo-sayittome-anon-block-rules",
  firestore: { rules, host: "127.0.0.1", port: 8080 },
});

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`chats/${CHAT_ID}`).set({
      receptorUid: PROFILE,
      targetUid: PROFILE,
      anonSessionId: ANON,
      initiatorUid: "visitorAuth1",
      participantes: [ANON, PROFILE, "visitorAuth1"],
      anonBlocksProfile: true,
    });
    await db.doc(`anon_profile_blocks/${CHAT_ID}`).set({
      anonSessionId: ANON,
      blockedProfileUid: PROFILE,
      chatId: CHAT_ID,
    });
  });

  const profile = testEnv.authenticatedContext(PROFILE, { email: "p@example.com" });
  const attacker = testEnv.authenticatedContext(OTHER, { email: "a@example.com" });
  const visitor = testEnv.authenticatedContext("visitorAuth1", { email: "v@example.com" });
  const unauth = testEnv.unauthenticatedContext();

  // Client cannot forge / clear blocks
  await assertFails(
    attacker.firestore().doc(`anon_profile_blocks/${CHAT_ID}`).set({
      anonSessionId: ANON,
      blockedProfileUid: PROFILE,
      chatId: CHAT_ID,
    }),
  );
  await assertFails(
    unauth.firestore().doc(`anon_profile_blocks/${CHAT_ID}`).delete(),
  );
  await assertFails(
    visitor.firestore().doc(`anon_profile_blocks/forged`).set({
      anonSessionId: ANON,
      blockedProfileUid: PROFILE,
    }),
  );

  // Client cannot flip chat.anonBlocksProfile
  await assertFails(
    profile.firestore().doc(`chats/${CHAT_ID}`).update({ anonBlocksProfile: false }),
  );

  // Profile→anon mensaje create rejected while blocked
  await assertFails(
    profile.firestore().collection(`chats/${CHAT_ID}/mensajes`).add({
      texto: "hack",
      fromUid: `profile_${PROFILE}`,
      senderKind: "profile",
      senderRole: "profile",
      profileUid: PROFILE,
      createdAt: new Date(),
    }),
  );
  await assertFails(
    profile.firestore().collection(`chats/${CHAT_ID}/mensajes`).add({
      texto: "bare uid forge",
      fromUid: PROFILE,
      createdAt: new Date(),
    }),
  );

  // Anon visitor can still write while block is active
  await assertSucceeds(
    visitor.firestore().collection(`chats/${CHAT_ID}/mensajes`).add({
      texto: "anon still ok",
      fromUid: ANON,
      senderKind: "anon",
      senderRole: "anon",
      createdAt: new Date(),
    }),
  );

  // Unrelated chat without block still accepts profile messages
  const openChat = `${ANON}2__anon_to__bob`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`chats/${openChat}`).set({
      receptorUid: PROFILE,
      targetUid: PROFILE,
      anonSessionId: `${ANON}2`,
      participantes: [`${ANON}2`, PROFILE],
    });
  });
  await assertSucceeds(
    profile.firestore().collection(`chats/${openChat}/mensajes`).add({
      texto: "open ok",
      fromUid: `profile_${PROFILE}`,
      senderKind: "profile",
      senderRole: "profile",
      profileUid: PROFILE,
      createdAt: new Date(),
    }),
  );

  console.log(JSON.stringify({ gate: "ANON_PROFILE_BLOCK_RULES_EMULATOR", pass: true }, null, 2));
} finally {
  await testEnv.cleanup();
}
