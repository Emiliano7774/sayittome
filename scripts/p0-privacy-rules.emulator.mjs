/**
 * P0 privacy rules emulator — fictitious data only (demo-p0-privacy-review).
 * Requires Firestore emulator at 127.0.0.1:8080 (reuse existing — do not start another).
 *
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
 *   node scripts/p0-privacy-rules.emulator.mjs draft
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
const mode = String(process.argv[2] || "baseline").trim();
const rulesFile =
  mode === "draft"
    ? path.join(root, "firestore.rules.p0-privacy-draft.rules")
    : path.join(root, "firestore.rules");
const rules = readFileSync(rulesFile, "utf8");

const PROJECT = "demo-p0-privacy-review";
const ADMIN_EMAIL = "emilianomaturano@gmail.com";
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
      gate: "P0_PRIVACY_RULES_EMULATOR",
      pass: false,
      error: "emulator_not_reachable",
      host: EMULATOR_HOST,
      port: EMULATOR_PORT,
      hint: "Start firestore emulator on 8080 or set P0_PRIVACY_EMULATOR_PORT",
    }),
  );
  process.exit(2);
}

const RECEPTOR = "receptor_demo_uid";
const VISITOR = "visitor_lease_uid";
const FOREIGN = "foreign_attacker_uid";
const ANON = "anon_demo_session01";
const ANON_NOT_VERIFIED = "anon_not_verified";
const CHAT_ID = `${ANON}__anon_to__demo_user`;
const MSG_ID = "msg_demo_001";
const LEGACY_CHAT = "legacy_shuffle_chat_01";
const LEGACY_SYNTHETIC = "legacy_synthetic_privacy_review";
const LEGACY_PEER = "legacy_peer_uid";

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules, host: EMULATOR_HOST, port: EMULATOR_PORT },
});

const results = {};

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const staleChats = await db.collection("chats").get();
    for (const doc of staleChats.docs) {
      const msgs = await doc.ref.collection("mensajes").get();
      for (const msg of msgs.docs) await msg.ref.delete();
      await doc.ref.delete();
    }
    const staleInbox = await db.collection("chat_inbox_lite").get();
    for (const doc of staleInbox.docs) await doc.ref.delete();
    await db.doc(`chats/${CHAT_ID}`).set({
      receptorUid: RECEPTOR,
      targetUid: RECEPTOR,
      anonSessionId: ANON,
      participantes: [ANON, RECEPTOR],
    });
    await db.doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).set({
      texto: "ficticio-demo-p0",
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
    await db.doc(`chat_inbox_lite/${CHAT_ID}`).set({
      chatId: CHAT_ID,
      receptorUid: RECEPTOR,
      preview: "demo",
    });
    await db.doc(`chats/${LEGACY_CHAT}`).set({
      receptorUid: LEGACY_PEER,
      participantes: [LEGACY_PEER, "legacy_other_uid"],
    });
    await db.doc(`chats/${LEGACY_CHAT}/mensajes/${MSG_ID}`).set({
      texto: "legacy demo",
      fromUid: LEGACY_PEER,
      createdAt: new Date(),
    });
    await db.doc(`chats/${LEGACY_SYNTHETIC}`).set({
      receptorUid: LEGACY_PEER,
      participantes: [LEGACY_PEER, "legacy_other_uid"],
    });
    await db.doc(`chats/${LEGACY_SYNTHETIC}/mensajes/qa_msg_001`).set({
      texto: "synthetic qa",
      fromUid: LEGACY_PEER,
      createdAt: new Date(),
    });
    const ANON_MATCH_CHAT = "anon_match_chat_demo_01";
    await db.doc(`chats_anonimos/${ANON_MATCH_CHAT}`).set({
      chatId: ANON_MATCH_CHAT,
      solicitanteUid: RECEPTOR,
      destinatarioUid: "anon_match_peer_uid",
      estado: "activo",
    });
    await db.doc(`chats_anonimos/${ANON_MATCH_CHAT}/mensajes/msg_anon_001`).set({
      texto: "anon match demo",
      senderId: RECEPTOR,
      createdAt: new Date(),
    });
    await db.doc("solicitudes_chat_anonimo/solicitud_demo_privacy").set({
      solicitanteUid: "anon_match_peer_uid",
      destinatarioUid: RECEPTOR,
      estado: "pendiente",
      createdAt: new Date(),
    });
  });

  const unauth = testEnv.unauthenticatedContext();
  const foreign = testEnv.authenticatedContext(FOREIGN, { email: "attacker@example.com" });
  const receptor = testEnv.authenticatedContext(RECEPTOR, { email: "owner@example.com" });
  const visitor = testEnv.authenticatedContext(VISITOR, { email: "visitor@example.com" });
  const admin = testEnv.authenticatedContext("admin_demo_uid", {
    email: ADMIN_EMAIL,
    email_verified: true,
  });
  const legacyPeer = testEnv.authenticatedContext(LEGACY_PEER, { email: "legacy@example.com" });

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

  const expectDenied = mode === "draft";

  await probe("unauth_chat_get", () => unauth.firestore().doc(`chats/${CHAT_ID}`).get(), expectDenied);
  await probe(
    "foreign_auth_chat_get",
    () => foreign.firestore().doc(`chats/${CHAT_ID}`).get(),
    expectDenied,
  );
  await probe(
    "foreign_auth_message_get",
    () => foreign.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).get(),
    expectDenied,
  );
  await probe(
    "foreign_message_list",
    () => foreign.firestore().collection(`chats/${CHAT_ID}/mensajes`).get(),
    expectDenied,
  );
  await probe(
    "foreign_inbox_lite_get",
    () => foreign.firestore().doc(`chat_inbox_lite/${CHAT_ID}`).get(),
    expectDenied,
  );
  await probe(
    "foreign_receipt_update",
    () =>
      foreign.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
        readBy: { [FOREIGN]: true },
      }),
    expectDenied,
  );

  if (mode === "draft") {
    await probe(
      "foreign_chat_create",
      () =>
        foreign.firestore().doc(`chats/${LEGACY_SYNTHETIC}`).set({
          receptorUid: FOREIGN,
          participantes: [FOREIGN],
        }),
      true,
    );
    await probe(
      "participantes_escalation_update",
      () =>
        foreign.firestore().doc(`chats/${LEGACY_SYNTHETIC}`).update({
          participantes: [FOREIGN],
        }),
      true,
    );
    await probe(
      "participantes_escalation_read_after",
      () => foreign.firestore().doc(`chats/${LEGACY_SYNTHETIC}/mensajes/qa_msg_001`).get(),
      true,
    );
    await probe(
      "foreign_chat_delete_recreate",
      () => foreign.firestore().doc(`chats/${LEGACY_SYNTHETIC}`).delete(),
      true,
    );
    await probe(
      "foreign_legacy_message_create",
      () =>
        foreign.firestore().collection(`chats/${LEGACY_SYNTHETIC}/mensajes`).add({
          texto: "inject",
          fromUid: FOREIGN,
          createdAt: new Date(),
        }),
      true,
    );
    await probe(
      "foreign_legacy_message_delete",
      () => foreign.firestore().doc(`chats/${LEGACY_SYNTHETIC}/mensajes/qa_msg_001`).delete(),
      true,
    );
  }

  await probe(
    "receptor_chat_get",
    () => receptor.firestore().doc(`chats/${CHAT_ID}`).get(),
    mode === "draft" ? false : expectDenied,
  );
  await probe(
    "visitor_lease_chat_get",
    () => visitor.firestore().doc(`chats/${CHAT_ID}`).get(),
    mode === "draft" ? false : expectDenied,
  );
  await probe(
    "admin_chat_get",
    () => admin.firestore().doc(`chats/${CHAT_ID}`).get(),
    mode === "draft" ? false : expectDenied,
  );

  if (mode === "draft") {
    await probe(
      "legacy_participant_get",
      () => legacyPeer.firestore().doc(`chats/${LEGACY_CHAT}`).get(),
      false,
    );
    await probe(
      "legacy_participant_message_list",
      () => legacyPeer.firestore().collection(`chats/${LEGACY_CHAT}/mensajes`).get(),
      false,
    );
    await probe(
      "foreign_legacy_get",
      () => foreign.firestore().doc(`chats/${LEGACY_CHAT}`).get(),
      true,
    );
    await probe(
      "receptor_inbox_query",
      () =>
        receptor
          .firestore()
          .collection("chat_inbox_lite")
          .where("receptorUid", "==", RECEPTOR)
          .get(),
      false,
    );
    await probe(
      "foreign_inbox_query",
      () =>
        foreign
          .firestore()
          .collection("chat_inbox_lite")
          .where("receptorUid", "==", RECEPTOR)
          .get(),
      true,
    );
    await probe(
      "receptor_chats_query_receptorUid",
      () =>
        receptor.firestore().collection("chats").where("receptorUid", "==", RECEPTOR).get(),
      false,
    );
    await probe(
      "receptor_chats_query_targetUid",
      () =>
        receptor.firestore().collection("chats").where("targetUid", "==", RECEPTOR).get(),
      false,
    );
    await probe(
      "legacy_participantes_query",
      () =>
        legacyPeer
          .firestore()
          .collection("chats")
          .where("participantes", "array-contains", LEGACY_PEER)
          .get(),
      false,
    );
    await probe(
      "visitor_receipt_wrong_uid_key",
      () =>
        visitor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
          readBy: { [RECEPTOR]: true },
        }),
      true,
    );
    await probe(
      "visitor_receipt_anon_alias",
      () =>
        visitor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
          [`readBy.${ANON}`]: true,
        }),
      false,
    );
    await probe(
      "visitor_receipt_wrong_auth_uid",
      () =>
        visitor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
          [`readBy.${VISITOR}`]: true,
        }),
      true,
    );
    await probe(
      "receptor_receipt_uid",
      () =>
        receptor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
          [`readBy.${RECEPTOR}`]: true,
        }),
      false,
    );
    await probe(
      "receptor_receipt_profile_alias",
      () =>
        receptor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
          [`readBy.profile_${RECEPTOR}`]: true,
        }),
      false,
    );
    await probe(
      "visitor_chat_receipt_anon",
      () =>
        visitor.firestore().doc(`chats/${CHAT_ID}`).update({
          [`readBy.${ANON}`]: true,
          [`unreadCounts.${ANON}`]: 0,
        }),
      false,
    );
    await probe(
      "receptor_chat_receipt_uid",
      () =>
        receptor.firestore().doc(`chats/${CHAT_ID}`).update({
          [`readBy.${RECEPTOR}`]: true,
          [`readAt.${RECEPTOR}`]: new Date(),
          [`unreadCounts.${RECEPTOR}`]: 0,
          [`latestReadMessageIds.${RECEPTOR}`]: MSG_ID,
        }),
      false,
    );
    await probe(
      "visitor_seenBy_owner_denied",
      () =>
        visitor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
          [`seenBy.${RECEPTOR}`]: true,
        }),
      true,
    );
    await probe(
      "anon_match_meta_update_allowed",
      () =>
        receptor.firestore().doc("chats_anonimos/anon_match_chat_demo_01").update({
          ultimoMensaje: "preview ok",
          updatedAt: new Date(),
        }),
      false,
    );
    await probe(
      "anon_match_identity_update_denied",
      () =>
        receptor.firestore().doc("chats_anonimos/anon_match_chat_demo_01").update({
          destinatarioUid: FOREIGN,
        }),
      true,
    );
    await probe(
      "anon_match_own_message_create",
      () =>
        receptor.firestore().collection("chats_anonimos/anon_match_chat_demo_01/mensajes").add({
          senderId: RECEPTOR,
          senderTipo: "perfil",
          texto: "hola",
          text: "hola",
          createdAt: new Date(),
        }),
      false,
    );
    await probe(
      "anon_match_foreign_message_create",
      () =>
        foreign.firestore().collection("chats_anonimos/anon_match_chat_demo_01/mensajes").add({
          senderId: FOREIGN,
          senderTipo: "perfil",
          texto: "inject",
          text: "inject",
          createdAt: new Date(),
        }),
      true,
    );
    await probe(
      "foreign_solicitud_rewrite_denied",
      () =>
        foreign.firestore().doc("solicitudes_chat_anonimo/solicitud_demo_privacy").update({
          destinatarioUid: FOREIGN,
          estado: "aceptado",
        }),
      true,
    );
    await probe(
      "foreign_arbitrary_receipt_alias",
      () =>
        foreign.firestore().doc(`chats/${CHAT_ID}`).update({
          [`readBy.${FOREIGN}`]: true,
        }),
      true,
    );
    await probe(
      "independent_visitor_poison_latestSenderAnonSessionId",
      () =>
        visitor.firestore().doc(`chats/${CHAT_ID}`).update({
          latestSenderAnonSessionId: ANON_NOT_VERIFIED,
        }),
      true,
    );
    await probe(
      "independent_visitor_receipt_unverified_anon",
      () =>
        visitor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
          [`readBy.${ANON_NOT_VERIFIED}`]: true,
        }),
      true,
    );
    await probe(
      "unauth_chats_anonimos_get",
      () => unauth.firestore().doc("chats_anonimos/anon_match_chat_demo_01").get(),
      true,
    );
    await probe(
      "foreign_chats_anonimos_get",
      () => foreign.firestore().doc("chats_anonimos/anon_match_chat_demo_01").get(),
      true,
    );
    await probe(
      "participant_chats_anonimos_get",
      () => receptor.firestore().doc("chats_anonimos/anon_match_chat_demo_01").get(),
      false,
    );
    await probe(
      "unauth_chats_anonimos_message_get",
      () =>
        unauth
          .firestore()
          .doc("chats_anonimos/anon_match_chat_demo_01/mensajes/msg_anon_001")
          .get(),
      true,
    );
    await probe(
      "receptor_lease_get_denied",
      () => receptor.firestore().doc(`anon_abuse_chat_leases/${CHAT_ID}`).get(),
      true,
    );
    await probe(
      "admin_lease_get_allowed",
      () => admin.firestore().doc(`anon_abuse_chat_leases/${CHAT_ID}`).get(),
      false,
    );
    await probe(
      "receptor_participantes_no_visitor_uid",
      async () => {
        const snap = await receptor.firestore().doc(`chats/${CHAT_ID}`).get();
        const parts = snap.data()?.participantes || [];
        if (Array.isArray(parts) && parts.includes(VISITOR)) {
          throw new Error("visitor_auth_uid_leaked_in_participantes");
        }
      },
      false,
    );
  }

  console.log(
    JSON.stringify({
      gate:
        mode === "draft" ? "P0_PRIVACY_RULES_DRAFT_EMULATOR" : "P0_PRIVACY_RULES_BASELINE_EMULATOR",
      pass: true,
      mode,
      project: PROJECT,
      isolationPass: false,
      results,
      note:
        mode === "baseline"
          ? "ALLOWED reads confirm active-pattern leak — NOT isolation PASS"
          : "Draft matrix incl. escalation/LIST/inbox — NOT prod isolation PASS until rollout",
      deployRules: false,
    }),
  );
} finally {
  await testEnv.cleanup();
}
