/**
 * Independent repro demo-p0-atomic-review-1635 — atomic send + both roles.
 * Uses shared buildProfileAnonAtomicSendBatch (same module as persistAnonMessage).
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
import { doc, writeBatch } from "firebase/firestore";
import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";
import { materializeOutgoingBatchForRulesEmulator } from "./p0-privacy-materialize-outgoing-batch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const { buildProfileAnonAtomicSendBatch, buildProfileAnonMessagePayload } = await import(
  new URL("../src/lib/chat/profileAnonSendPayload.ts", import.meta.url).href,
);
const rules = readFileSync(path.join(root, "firestore.rules.p0-privacy-draft.rules"), "utf8");

const PROJECT = "demo-p0-atomic-review-1635";
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
      gate: "P0_PRIVACY_INDEPENDENT_1635",
      pass: false,
      error: "emulator_not_reachable",
      project: PROJECT,
    }),
  );
  process.exit(2);
}

const RECEPTOR = "owner_profile_uid_1635";
const VISITOR = "visitor_lease_uid_1635";
const ANON = "anon_verified_session_1635";
const CHAT_ID = `${ANON}__anon_to__profile_1635`;
const PREVIEW = "payload compartido real";

const MSG_VISITOR = "msg_visitor_atomic_1635";
const MSG_VISITOR_2 = "msg_visitor_atomic_1635b";
const MSG_OWNER = "msg_owner_atomic_1635";
const MSG_CTRL = "msg_ctrl_no_uid_1635";
const MSG_LEAK_AUTH = "msg_leak_senderAuthUid_1635";
const MSG_LEAK_CREATED = "msg_leak_createdByAuthUid_1635";
const MSG_REPLAY = "msg_replay_existing_1635";

function permitIdFor(messageId) {
  return `permit_${messageId}_1635demo01`;
}

function visitorBatch(messageId) {
  return buildProfileAnonAtomicSendBatch({
    messageText: PREVIEW,
    messageId,
    senderAuthorId: ANON,
    senderKind: "anon",
    senderRole: "anon",
    unreadRecipients: [RECEPTOR],
    latestSenderAnonSessionId: ANON,
    senderIsAnonymous: true,
    abuseSendPermitId: permitIdFor(messageId),
  });
}

function ownerBatch(messageId) {
  return buildProfileAnonAtomicSendBatch({
    messageText: PREVIEW,
    messageId,
    senderAuthorId: RECEPTOR,
    senderKind: "profile",
    senderRole: "profile",
    unreadRecipients: [ANON],
    latestSenderAnonSessionId: ANON,
    senderIsAnonymous: false,
    persistAuthUid: RECEPTOR,
    senderAuthUid: RECEPTOR,
    senderProfileId: RECEPTOR,
    profileUid: RECEPTOR,
  });
}

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules, host: EMULATOR_HOST, port: EMULATOR_PORT },
});

const results = {};

try {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`chats/${CHAT_ID}`).set({
      id: CHAT_ID,
      receptorUid: RECEPTOR,
      targetUid: RECEPTOR,
      anonOwnerUid: RECEPTOR,
      anonSessionId: ANON,
      participantes: [ANON, RECEPTOR],
      canonicalChatId: CHAT_ID,
      schemaVersion: 2,
      readBy: { [ANON]: true, [RECEPTOR]: false, [`profile_${RECEPTOR}`]: false },
      unreadCounts: { [RECEPTOR]: 2, [`profile_${RECEPTOR}`]: 2, [ANON]: 0 },
    });
    await db.doc(`anon_abuse_chat_leases/${CHAT_ID}`).set({
      chatId: CHAT_ID,
      visitorAuthUid: VISITOR,
      receptorUid: RECEPTOR,
      blockedAnonId: ANON,
      status: "active",
    });
    for (const messageId of [
      MSG_VISITOR,
      MSG_VISITOR_2,
      MSG_OWNER,
      MSG_CTRL,
      MSG_LEAK_AUTH,
      MSG_LEAK_CREATED,
      MSG_REPLAY,
    ]) {
      await db.doc(`anon_abuse_send_permits/${permitIdFor(messageId)}`).set({
        chatId: CHAT_ID,
        messageId,
        visitorAuthUid: VISITOR,
        receptorUid: RECEPTOR,
        expiresAtMs: Date.now() + 120_000,
        status: "active",
        revokedAtMs: 0,
      });
    }
    await db.doc(`chats/${CHAT_ID}/mensajes/${MSG_REPLAY}`).set({
      texto: "already-there",
      fromUid: ANON,
      senderKind: "anon",
      createdAt: new Date(),
    });
  });

  const visitor = testEnv.authenticatedContext(VISITOR, { email: "visitor@example.com" });
  const receptor = testEnv.authenticatedContext(RECEPTOR, { email: "owner@example.com" });
  const vDb = visitor.firestore();
  const rDb = receptor.firestore();

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
    "visitor_atomic_batch_allowed",
    async () => {
      const payload = visitorBatch(MSG_VISITOR);
      const batch = writeBatch(vDb);
      batch.set(doc(vDb, "chats", CHAT_ID), payload.chatWritePayload, { merge: true });
      batch.set(doc(vDb, "chats", CHAT_ID, "mensajes", MSG_VISITOR), payload.messagePayload);
      await batch.commit();
    },
    false,
  );

  await probe(
    "visitor_second_send_from_unread_gt0_allowed",
    async () => {
      const payload = visitorBatch(MSG_VISITOR_2);
      const batch = writeBatch(vDb);
      batch.set(doc(vDb, "chats", CHAT_ID), payload.chatWritePayload, { merge: true });
      batch.set(doc(vDb, "chats", CHAT_ID, "mensajes", MSG_VISITOR_2), payload.messagePayload);
      await batch.commit();
    },
    false,
  );

  await probe(
    "owner_reply_readBy_false_both_aliases_allowed",
    async () => {
      const payload = ownerBatch(MSG_OWNER);
      const batch = writeBatch(rDb);
      batch.set(doc(rDb, "chats", CHAT_ID), payload.chatWritePayload, { merge: true });
      batch.set(doc(rDb, "chats", CHAT_ID, "mensajes", MSG_OWNER), payload.messagePayload);
      await batch.commit();
    },
    false,
  );

  await probe(
    "preview_without_message_denied",
    () =>
      vDb.doc(`chats/${CHAT_ID}`).update({
        lastMessage: "preview huérfano",
        lastMessageSender: ANON,
      }),
    true,
  );

  await probe(
    "unread_arbitrary_without_message_denied",
    () =>
      vDb.doc(`chats/${CHAT_ID}`).update({
        unreadCounts: {
          [RECEPTOR]: 99999,
          [`profile_${RECEPTOR}`]: 99999,
        },
      }),
    true,
  );

  await probe(
    "replay_existing_message_denied",
    async () => {
      const payload = visitorBatch(MSG_REPLAY);
      const batch = writeBatch(vDb);
      batch.set(doc(vDb, "chats", CHAT_ID), payload.chatWritePayload, { merge: true });
      batch.set(doc(vDb, "chats", CHAT_ID, "mensajes", MSG_REPLAY), payload.messagePayload);
      await batch.commit();
    },
    true,
  );

  await probe(
    "control_anon_message_no_public_uid_allowed",
    () =>
      vDb
        .doc(`chats/${CHAT_ID}/mensajes/${MSG_CTRL}`)
        .set(
          buildProfileAnonMessagePayload({
            messageText: PREVIEW,
            senderAuthorId: ANON,
            senderKind: "anon",
            senderRole: "anon",
            abuseSendPermitId: permitIdFor(MSG_CTRL),
          }),
        ),
    false,
  );

  await probe(
    "senderAuthUid_denied_with_valid_permit",
    () =>
      vDb.doc(`chats/${CHAT_ID}/mensajes/${MSG_LEAK_AUTH}`).set({
        ...buildProfileAnonMessagePayload({
          messageText: PREVIEW,
          senderAuthorId: ANON,
          senderKind: "anon",
          senderRole: "anon",
          abuseSendPermitId: permitIdFor(MSG_LEAK_AUTH),
        }),
        senderAuthUid: VISITOR,
      }),
    true,
  );

  await probe(
    "createdByAuthUid_denied_with_valid_permit",
    () =>
      vDb.doc(`chats/${CHAT_ID}/mensajes/${MSG_LEAK_CREATED}`).set({
        ...buildProfileAnonMessagePayload({
          messageText: PREVIEW,
          senderAuthorId: ANON,
          senderKind: "anon",
          senderRole: "anon",
          abuseSendPermitId: permitIdFor(MSG_LEAK_CREATED),
        }),
        createdByAuthUid: VISITOR,
      }),
    true,
  );

  try {
    const snap = await assertSucceeds(
      receptor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_VISITOR}`).get(),
    );
    const data = snap.data() || {};
    const hasLeak =
      Object.prototype.hasOwnProperty.call(data, "senderAuthUid") ||
      Object.prototype.hasOwnProperty.call(data, "createdByAuthUid");
    if (hasLeak || data.fromUid !== ANON || data.senderKind !== "anon") {
      throw new Error("authorship_regression");
    }
    results.receptor_reads_visitor_message_authorship = "ALLOWED";
  } catch (error) {
    results.receptor_reads_visitor_message_authorship = "ERROR";
    throw new Error(`probe receptor_reads_visitor_message_authorship failed: ${error?.message || error}`);
  }

  console.log(
    JSON.stringify({
      gate: "P0_PRIVACY_INDEPENDENT_1635",
      pass: true,
      project: PROJECT,
      isolationPass: false,
      deployRules: false,
      results,
      note: "Atomic getAfter send + shared production payload; second send unread>0; owner reply",
    }),
  );
} finally {
  await testEnv.cleanup();
}
