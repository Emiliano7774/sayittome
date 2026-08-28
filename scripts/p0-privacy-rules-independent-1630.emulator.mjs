/**
 * Independent repro demo-p0-independent-1630 — receipt map wipe via null/[]/0 (bbfa7fe920e5).
 * Field touched must stay map+diff with own keys only; no fallback [] that authorizes.
 */
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = readFileSync(path.join(root, "firestore.rules.p0-privacy-draft.rules"), "utf8");

const PROJECT = "demo-p0-independent-1630";
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
      gate: "P0_PRIVACY_INDEPENDENT_1630",
      pass: false,
      error: "emulator_not_reachable",
      project: PROJECT,
    }),
  );
  process.exit(2);
}

const RECEPTOR = "owner_profile_uid_1630";
const VISITOR = "visitor_lease_uid_1630";
const ANON = "anon_verified_session_1630";
const CHAT_ID = `${ANON}__anon_to__profile_1630`;
const MSG_ID = "msg_profile_1630";

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
      readBy: { [RECEPTOR]: true, [ANON]: true },
      readAt: { [RECEPTOR]: new Date(), [ANON]: new Date() },
      unreadCounts: { [RECEPTOR]: 0, [ANON]: 1 },
      latestReadMessageIds: { [RECEPTOR]: MSG_ID, [ANON]: MSG_ID },
    });
    await db.doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).set({
      texto: "profile-family-demo",
      fromUid: ANON,
      senderKind: "anon",
      readBy: { [RECEPTOR]: true, [ANON]: true },
      seenBy: { [RECEPTOR]: true, [ANON]: true },
      createdAt: new Date(),
    });
    await db.doc(`anon_abuse_chat_leases/${CHAT_ID}`).set({
      chatId: CHAT_ID,
      visitorAuthUid: VISITOR,
      receptorUid: RECEPTOR,
      blockedAnonId: ANON,
      status: "active",
    });
  });

  const visitor = testEnv.authenticatedContext(VISITOR, { email: "visitor@example.com" });

  async function probe(label, fn, expectDenied) {
    try {
      if (expectDenied) {
        await assertFails(fn());
        results[label] = "DENIED";
      } else {
        await assertFails(fn());
        results[label] = "ERROR_UNEXPECTED_ALLOW";
      }
    } catch (error) {
      results[label] = "ERROR";
      throw new Error(`probe ${label} failed: ${error?.message || error}`);
    }
  }

  await probe(
    "visitor_wipe_readBy_null",
    () => visitor.firestore().doc(`chats/${CHAT_ID}`).update({ readBy: null }),
    true,
  );
  await probe(
    "visitor_wipe_readAt_null",
    () => visitor.firestore().doc(`chats/${CHAT_ID}`).update({ readAt: null }),
    true,
  );
  await probe(
    "visitor_wipe_unreadCounts_scalar",
    () => visitor.firestore().doc(`chats/${CHAT_ID}`).update({ unreadCounts: 0 }),
    true,
  );
  await probe(
    "visitor_wipe_seenBy_empty_list",
    () =>
      visitor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
        seenBy: [],
      }),
    true,
  );
  await probe(
    "visitor_wipe_message_readBy_null",
    () =>
      visitor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
        readBy: null,
      }),
    true,
  );

  console.log(
    JSON.stringify({
      gate: "P0_PRIVACY_INDEPENDENT_1630",
      pass: true,
      project: PROJECT,
      isolationPass: false,
      deployRules: false,
      results,
    }),
  );
} finally {
  await testEnv.cleanup();
}
