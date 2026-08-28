/**
 * Independent repro demo-p0-independent-1618 — metadata poison + receipt alias escalation.
 * Reuses Firestore emulator; does NOT deploy rules.
 *
 *   $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
 *   node scripts/p0-privacy-rules-independent.emulator.mjs
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

const PROJECT = "demo-p0-independent-1618";
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
      gate: "P0_PRIVACY_INDEPENDENT_1618",
      pass: false,
      error: "emulator_not_reachable",
      project: PROJECT,
    }),
  );
  process.exit(2);
}

const RECEPTOR = "receptor_independent_uid";
const VISITOR = "visitor_lease_independent_uid";
const ANON = "anon_verified_session01";
const ANON_NOT_VERIFIED = "anon_not_verified";
const CHAT_ID = `${ANON}__anon_to__independent_user`;
const MSG_ID = "msg_independent_001";

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
      texto: "independent-demo-1618",
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
  });

  const visitor = testEnv.authenticatedContext(VISITOR, { email: "visitor@example.com" });

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
    "poison_latestSenderAnonSessionId",
    () =>
      visitor.firestore().doc(`chats/${CHAT_ID}`).update({
        latestSenderAnonSessionId: ANON_NOT_VERIFIED,
      }),
    true,
  );
  await probe(
    "receipt_readBy_unverified_anon",
    () =>
      visitor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
        [`readBy.${ANON_NOT_VERIFIED}`]: true,
      }),
    true,
  );
  await probe(
    "receipt_readBy_verified_anon",
    () =>
      visitor.firestore().doc(`chats/${CHAT_ID}/mensajes/${MSG_ID}`).update({
        [`readBy.${ANON}`]: true,
      }),
    false,
  );

  console.log(
    JSON.stringify({
      gate: "P0_PRIVACY_INDEPENDENT_1618",
      pass: true,
      project: PROJECT,
      isolationPass: false,
      deployRules: false,
      results,
      note: "Metadata poison + unverified receipt alias must stay DENIED in draft",
    }),
  );
} finally {
  await testEnv.cleanup();
}
