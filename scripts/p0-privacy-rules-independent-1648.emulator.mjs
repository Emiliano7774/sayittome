/**
 * Independent repro demo-p0-independent-extra-1648 — batch metadata map key diff (R6).
 * Valid atomic batch + poisoned readBy/unread/typing/lastMessageSender must DENY.
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
installHarnessWindow();
installHarnessAlias(root);

const { buildProfileAnonAtomicSendBatch } = await import(
  new URL("../src/lib/chat/profileAnonSendPayload.ts", import.meta.url).href,
);

const rules = readFileSync(path.join(root, "firestore.rules.p0-privacy-draft.rules"), "utf8");

const PROJECT = "demo-p0-independent-extra-1648";
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
      gate: "P0_PRIVACY_INDEPENDENT_1648",
      pass: false,
      error: "emulator_not_reachable",
      project: PROJECT,
    }),
  );
  process.exit(2);
}

const RECEPTOR = "owner_profile_uid_1648";
const VISITOR = "visitor_lease_uid_1648";
const ANON = "anon_verified_session_1648";
const CHAT_ID = `${ANON}__anon_to__profile_1648`;
const STRANGER = "stranger_test_1648";

function permitIdFor(messageId) {
  return `permit_${messageId}_1648demo01`;
}

function visitorBatch(messageId) {
  return buildProfileAnonAtomicSendBatch({
    messageText: "envío visitante",
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
    messageText: "respuesta owner",
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
const messageIds = [
  "msg_v_readby_1648",
  "msg_v_unread_1648",
  "msg_v_sender_1648",
  "msg_v_typing_1648",
  "msg_o_readby_1648",
  "msg_o_unread_1648",
  "msg_o_sender_1648",
  "msg_o_typing_1648",
  "msg_v_control_1648",
  "msg_o_control_1648",
];

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
      unreadCounts: { [RECEPTOR]: 1, [`profile_${RECEPTOR}`]: 1, [ANON]: 0 },
    });
    await db.doc(`anon_abuse_chat_leases/${CHAT_ID}`).set({
      chatId: CHAT_ID,
      visitorAuthUid: VISITOR,
      receptorUid: RECEPTOR,
      blockedAnonId: ANON,
      status: "active",
    });
    for (const messageId of messageIds) {
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

  async function commitOutgoingBatch(db, messageId, payload) {
    const batch = writeBatch(db);
    batch.set(doc(db, "chats", CHAT_ID), payload.chatWritePayload, { merge: true });
    batch.set(doc(db, "chats", CHAT_ID, "mensajes", messageId), payload.messagePayload);
    await batch.commit();
  }

  async function resetLastMessageSender(value) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`chats/${CHAT_ID}`).set({ lastMessageSender: value }, { merge: true });
    });
  }

  async function resetChatBaseline() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`chats/${CHAT_ID}`).set(
        {
          readBy: { [ANON]: true, [RECEPTOR]: false, [`profile_${RECEPTOR}`]: false },
          unreadCounts: { [RECEPTOR]: 1, [`profile_${RECEPTOR}`]: 1, [ANON]: 0 },
          lastMessageSender: ANON,
        },
        { merge: true },
      );
    });
  }

  await probe(
    "visitor_control_batch_allowed",
    async () => {
      const payload = visitorBatch("msg_v_control_1648");
      await commitOutgoingBatch(vDb, "msg_v_control_1648", payload);
    },
    false,
  );

  await resetChatBaseline();
  await probe(
    "owner_control_batch_allowed",
    async () => {
      const payload = ownerBatch("msg_o_control_1648");
      await commitOutgoingBatch(rDb, "msg_o_control_1648", payload);
    },
    false,
  );

  await resetChatBaseline();
  await probe(
    "visitor_batch_foreign_readBy_denied",
    async () => {
      const payload = visitorBatch("msg_v_readby_1648");
      payload.chatWritePayload.readBy = {
        ...payload.chatWritePayload.readBy,
        [STRANGER]: true,
      };
      await commitOutgoingBatch(vDb, "msg_v_readby_1648", payload);
    },
    true,
  );

  await probe(
    "visitor_batch_foreign_unreadCounts_denied",
    async () => {
      const payload = visitorBatch("msg_v_unread_1648");
      payload.chatWritePayload.unreadCounts = {
        ...payload.chatWritePayload.unreadCounts,
        [STRANGER]: 99999,
      };
      await commitOutgoingBatch(vDb, "msg_v_unread_1648", payload);
    },
    true,
  );

  await resetLastMessageSender(ANON);
  await probe(
    "visitor_batch_spoof_lastMessageSender_denied",
    async () => {
      const payload = visitorBatch("msg_v_sender_1648");
      payload.chatWritePayload.lastMessageSender = RECEPTOR;
      await commitOutgoingBatch(vDb, "msg_v_sender_1648", payload);
    },
    true,
  );

  await probe(
    "visitor_batch_foreign_typing_denied",
    async () => {
      const payload = visitorBatch("msg_v_typing_1648");
      payload.chatWritePayload.typing = {
        ...payload.chatWritePayload.typing,
        [STRANGER]: true,
      };
      await commitOutgoingBatch(vDb, "msg_v_typing_1648", payload);
    },
    true,
  );

  await probe(
    "owner_batch_foreign_readBy_denied",
    async () => {
      const payload = ownerBatch("msg_o_readby_1648");
      payload.chatWritePayload.readBy = {
        ...payload.chatWritePayload.readBy,
        [STRANGER]: true,
      };
      await commitOutgoingBatch(rDb, "msg_o_readby_1648", payload);
    },
    true,
  );

  await probe(
    "owner_batch_foreign_unreadCounts_denied",
    async () => {
      const payload = ownerBatch("msg_o_unread_1648");
      payload.chatWritePayload.unreadCounts = {
        ...payload.chatWritePayload.unreadCounts,
        [STRANGER]: 99999,
      };
      await commitOutgoingBatch(rDb, "msg_o_unread_1648", payload);
    },
    true,
  );

  await resetLastMessageSender(RECEPTOR);
  await probe(
    "owner_batch_spoof_lastMessageSender_denied",
    async () => {
      const payload = ownerBatch("msg_o_sender_1648");
      payload.chatWritePayload.lastMessageSender = ANON;
      await commitOutgoingBatch(rDb, "msg_o_sender_1648", payload);
    },
    true,
  );

  await probe(
    "owner_batch_foreign_typing_denied",
    async () => {
      const payload = ownerBatch("msg_o_typing_1648");
      payload.chatWritePayload.typing = {
        ...payload.chatWritePayload.typing,
        [STRANGER]: true,
      };
      await commitOutgoingBatch(rDb, "msg_o_typing_1648", payload);
    },
    true,
  );

  console.log(
    JSON.stringify({
      gate: "P0_PRIVACY_INDEPENDENT_1648",
      pass: true,
      project: PROJECT,
      isolationPass: false,
      deployRules: false,
      results,
      note: "R6 map key diff + lastMessageSender coherence; both roles",
    }),
  );
} finally {
  await testEnv.cleanup();
}
