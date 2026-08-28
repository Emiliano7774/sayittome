/**
 * Independent repro demo-p0-independent-1627 — seven synthetic ALLOWED that must be DENIED.
 * Executed against draft rules; does NOT deploy.
 */
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = readFileSync(path.join(root, "firestore.rules.p0-privacy-draft.rules"), "utf8");

const PROJECT = "demo-p0-independent-1627";
const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = Number(process.env.P0_PRIVACY_EMULATOR_PORT || 8080);

async function probeEmulator(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

if (!(await probeEmulator(EMULATOR_HOST, EMULATOR_PORT))) {
  console.log(
    JSON.stringify({
      gate: "P0_PRIVACY_INDEPENDENT_1627",
      pass: false,
      error: "emulator_not_reachable",
      project: PROJECT,
    }),
  );
  process.exit(2);
}

const RECEPTOR = "owner_profile_uid_1627";
const VISITOR = "visitor_lease_uid_1627";
const MEMBER_A = "anon_match_member_a_1627";
const MEMBER_B = "anon_match_member_b_1627";
const FOREIGN = "foreign_third_party_1627";
const ANON = "anon_verified_session_1627";
const CHAT_ID = `${ANON}__anon_to__profile_1627`;
const MSG_ID = "msg_profile_1627";
const ANON_MATCH_CHAT = "anon_match_chat_1627";
const ANON_MSG = "msg_anon_match_1627";
const SOLICITUD_ID = "solicitud_demo_1627";

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules, host: EMULATOR_HOST, port: EMULATOR_PORT },
});

const results = {};

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`chats/${CHAT_ID}`).set({
      receptorUid: RECEPTOR,
      targetUid: RECEPTOR,
      anonSessionId: ANON,
      participantes: [ANON, RECEPTOR],
    });
    await db.doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).set({
      texto: "profile-family-demo",
      fromUid: ANON,
      senderKind: "anon",
      createdAt: new Date(),
    });
    await db.doc(`anon_abuse_chat_leases/${CHAT_ID}`).set({
      chatId: CHAT_ID,
      visitorAuthUid: VISITOR,
      receptorUid: RECEPTOR,
      blockedAnonId: ANON,
      status: "active",
    });
    await db.doc(`chats_anonimos/${ANON_MATCH_CHAT}`).set({
      chatId: ANON_MATCH_CHAT,
      solicitanteUid: MEMBER_A,
      destinatarioUid: MEMBER_B,
      estado: "activo",
    });
    await db.doc(`chats_anonimos/${ANON_MATCH_CHAT}/mensajes/${ANON_MSG}`).set({
      senderId: MEMBER_A,
      senderTipo: "perfil",
      texto: "anon-match-demo",
      createdAt: new Date(),
    });
    await db.doc(`solicitudes_chat_anonimo/${SOLICITUD_ID}`).set({
      solicitanteUid: MEMBER_A,
      destinatarioUid: MEMBER_B,
      estado: "pendiente",
      createdAt: new Date(),
    });
  });

  const visitor = testEnv.authenticatedContext(VISITOR, { email: "visitor@example.com" });
  const memberA = testEnv.authenticatedContext(MEMBER_A, { email: "membera@example.com" });
  const foreign = testEnv.authenticatedContext(FOREIGN, { email: "foreign@example.com" });

  async function probe(label, fn, expectDenied) {
    try {
      if (expectDenied) {
        await assertFails(fn());
        results[label] = "DENIED";
      } else {
        await assertSucceeds(fn());
        results[label] = "ALLOWED";
      }
    } catch (error) {
      results[label] = "ERROR";
      throw new Error(`probe ${label} failed: ${error?.message || error}`);
    }
  }

  await probe(
    "visitor_seenBy_owner",
    () =>
      visitor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
        [`seenBy.${RECEPTOR}`]: true,
      }),
    true,
  );
  await probe(
    "visitor_readAt_owner",
    () =>
      visitor.firestore().doc(`chats/${CHAT_ID}`).update({
        [`readAt.${RECEPTOR}`]: new Date(),
      }),
    true,
  );
  await probe(
    "visitor_latestReadMessageIds_owner",
    () =>
      visitor.firestore().doc(`chats/${CHAT_ID}`).update({
        [`latestReadMessageIds.${RECEPTOR}`]: MSG_ID,
      }),
    true,
  );
  await probe(
    "anon_match_foreign_sender_message",
    () =>
      memberA.firestore().collection(`chats_anonimos/${ANON_MATCH_CHAT}/mensajes`).add({
        senderId: FOREIGN,
        senderTipo: "perfil",
        texto: "inject",
        text: "inject",
        createdAt: new Date(),
      }),
    true,
  );
  await probe(
    "anon_match_identity_escalation_destinatarioUid",
    () =>
      memberA.firestore().doc(`chats_anonimos/${ANON_MATCH_CHAT}`).update({
        destinatarioUid: FOREIGN,
        participantes: [MEMBER_A, FOREIGN],
      }),
    true,
  );
  await probe(
    "anon_match_third_party_read_after_escalation",
    () => foreign.firestore().doc(`chats_anonimos/${ANON_MATCH_CHAT}`).get(),
    true,
  );
  await probe(
    "foreign_rewrites_solicitud",
    () =>
      foreign.firestore().doc(`solicitudes_chat_anonimo/${SOLICITUD_ID}`).update({
        destinatarioUid: FOREIGN,
        estado: "aceptado",
      }),
    true,
  );

  console.log(
    JSON.stringify({
      gate: "P0_PRIVACY_INDEPENDENT_1627",
      pass: true,
      project: PROJECT,
      isolationPass: false,
      deployRules: false,
      results,
      note: "Seven synthetic escalations must stay DENIED — executed repro, not static review",
    }),
  );
} finally {
  await testEnv.cleanup();
}
