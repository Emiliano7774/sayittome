/**
 * Independent repro demo-p0-real-send-1631 — real persistAnonMessage batch + authorship.
 * Isolated message ALLOWED; realistic message+outgoing meta batch ALLOWED;
 * public senderAuthUid/createdByAuthUid on anon message DENIED.
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
import {
  collection,
  doc,
  writeBatch,
} from "firebase/firestore";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = readFileSync(path.join(root, "firestore.rules.p0-privacy-draft.rules"), "utf8");

const PROJECT = "demo-p0-real-send-1631";
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
      gate: "P0_PRIVACY_INDEPENDENT_1631",
      pass: false,
      error: "emulator_not_reachable",
      project: PROJECT,
    }),
  );
  process.exit(2);
}

const RECEPTOR = "owner_profile_uid_1631";
const VISITOR = "visitor_lease_uid_1631";
const ANON = "anon_verified_session_1631";
const CHAT_ID = `${ANON}__anon_to__profile_1631`;
const MSG_ID = "msg_real_send_1631";
const MSG_ID_BATCH = "msg_real_batch_1631";
const PERMIT_ID = "permit_real_send_1631_demo0001";
const PERMIT_BATCH = "permit_real_batch_1631_demo0001";
const PREVIEW = "hola desde payload real";

function buildRealOutgoingChatPatch(senderAnon, receptor, messageId) {
  return {
    lastMessage: PREVIEW,
    lastMessageSender: senderAnon,
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    latestMessageId: messageId,
    latestSenderKind: "anon",
    latestSenderAnonSessionId: senderAnon,
    typing: { [senderAnon]: false },
    readBy: {
      [senderAnon]: true,
      [receptor]: false,
      [`profile_${receptor}`]: false,
    },
    unreadCounts: {
      [receptor]: 1,
      [`profile_${receptor}`]: 1,
    },
    senderIsAnonymous: true,
  };
}

function buildRealAnonMessagePayload(anon, messageId, permitId) {
  return {
    texto: PREVIEW,
    text: PREVIEW,
    createdAt: new Date(),
    fromUid: anon,
    ownerId: anon,
    senderKind: "anon",
    senderRole: "anon",
    identityReadyAtWrite: true,
    abuseSendPermitId: permitId,
    readBy: { [anon]: true },
    type: "text",
  };
}

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules, host: EMULATOR_HOST, port: EMULATOR_PORT },
});

const results = {};

try {
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
      readBy: { [ANON]: true, [RECEPTOR]: true },
      unreadCounts: { [RECEPTOR]: 0, [ANON]: 0 },
    });
    await db.doc(`anon_abuse_chat_leases/${CHAT_ID}`).set({
      chatId: CHAT_ID,
      visitorAuthUid: VISITOR,
      receptorUid: RECEPTOR,
      blockedAnonId: ANON,
      status: "active",
    });
    const permitBase = {
      chatId: CHAT_ID,
      visitorAuthUid: VISITOR,
      receptorUid: RECEPTOR,
      expiresAtMs: Date.now() + 60_000,
      status: "active",
      revokedAtMs: 0,
    };
    await db.doc(`anon_abuse_send_permits/${PERMIT_ID}`).set({
      ...permitBase,
      messageId: MSG_ID,
    });
    await db.doc(`anon_abuse_send_permits/${PERMIT_BATCH}`).set({
      ...permitBase,
      messageId: MSG_ID_BATCH,
    });
  });

  const visitor = testEnv.authenticatedContext(VISITOR, { email: "visitor@example.com" });
  const receptor = testEnv.authenticatedContext(RECEPTOR, { email: "owner@example.com" });
  const vDb = visitor.firestore();

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
    "anon_message_real_payload",
    () =>
      vDb
        .doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`)
        .set(buildRealAnonMessagePayload(ANON, MSG_ID, PERMIT_ID)),
    false,
  );

  await probe(
    "real_send_batch",
    async () => {
      const batch = writeBatch(vDb);
      batch.set(
        doc(vDb, "chats", CHAT_ID),
        buildRealOutgoingChatPatch(ANON, RECEPTOR, MSG_ID_BATCH),
        { merge: true },
      );
      batch.set(
        doc(vDb, "chats", CHAT_ID, "mensajes", MSG_ID_BATCH),
        buildRealAnonMessagePayload(ANON, MSG_ID_BATCH, PERMIT_BATCH),
      );
      await batch.commit();
    },
    false,
  );

  await probe(
    "anon_message_public_auth_uid_denied",
    () =>
      vDb.doc(`chats/${CHAT_ID}/mensajes/msg_auth_leak_1631`).set({
        ...buildRealAnonMessagePayload(ANON, "msg_auth_leak_1631", PERMIT_ID),
        senderAuthUid: VISITOR,
        createdByAuthUid: VISITOR,
      }),
    true,
  );

  try {
    const snap = await assertSucceeds(
      receptor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID_BATCH}`).get(),
    );
    const data = snap.data() || {};
    const hasLeak =
      Object.prototype.hasOwnProperty.call(data, "senderAuthUid") ||
      Object.prototype.hasOwnProperty.call(data, "createdByAuthUid");
    if (hasLeak || data.fromUid !== ANON || data.senderKind !== "anon") {
      throw new Error("receptor_message_authorship_regression_failed");
    }
    results.receptor_message_no_public_uid = "ALLOWED";
  } catch (error) {
    results.receptor_message_no_public_uid = "ERROR";
    throw new Error(`probe receptor_message_no_public_uid failed: ${error?.message || error}`);
  }

  console.log(
    JSON.stringify({
      gate: "P0_PRIVACY_INDEPENDENT_1631",
      pass: false,
      supersededBy: "P0_PRIVACY_INDEPENDENT_1635",
      project: PROJECT,
      isolationPass: false,
      deployRules: false,
      results,
      note: "DO NOT PASS — manual builders + wrong permit on UID negative; use 1635",
    }),
  );
} finally {
  await testEnv.cleanup();
}
