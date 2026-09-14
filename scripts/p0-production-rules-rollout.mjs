/**
 * Coordinated P0 production smoke + Rules rollout.
 * Requires explicit P0_APPROVE_RULES_DEPLOY=YES for the one-time deployment.
 * P0_VERIFY_ONLY=YES reruns the strict production smoke without deploying.
 * Never prints auth tokens or IDs.
 * On a post-deploy smoke failure, restores the committed open rules immediately.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { initializeApp, deleteApp } from "firebase/app";
import { deleteUser, getAuth, signInAnonymously } from "firebase/auth";
import {
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

import { installHarnessAlias, installHarnessWindow } from "./harness-alias.mjs";

installHarnessWindow();
installHarnessAlias(process.cwd());

const { buildProfileAnonAtomicSendBatch } = await import(
  new URL("../src/lib/chat/profileAnonSendPayload.ts", import.meta.url).href
);

const firebaseConfig = {
  apiKey: "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk",
  authDomain: "sayittome-app.firebaseapp.com",
  projectId: "sayittome-app",
  storageBucket: "sayittome-app.firebasestorage.app",
  messagingSenderId: "676263895580",
  appId: "1:676263895580:web:2c7ffa7827c2a4799f35d9",
};

const WEB = "https://sayittome-app.web.app";
const DIRECT = "https://us-central1-sayittome-app.cloudfunctions.net/ssrsayittomeapp";
const approved = process.env.P0_APPROVE_RULES_DEPLOY === "YES";
const verifyOnly = process.env.P0_VERIFY_ONLY === "YES";
const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const username = `p0qa_${stamp}`;

function createClient(label) {
  const app = initializeApp(firebaseConfig, `p0-${label}-${stamp}`);
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    functions: getFunctions(app, "us-central1"),
  };
}

const owner = createClient("owner");
const visitor = createClient("visitor");
const stranger = createClient("stranger");
let chatId = "";
let activeMessageId = "";
let rulesDeployed = false;
let rollbackExecuted = false;

async function jsonPost(url, token, body, origin = WEB) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

function deployRules(config = "firebase.json") {
  const result = spawnSync(
    "firebase",
    [
      "deploy",
      "--only",
      "firestore:rules",
      "--project",
      "sayittome-app",
      "--config",
      config,
      "--non-interactive",
      "--force",
    ],
    { cwd: process.cwd(), encoding: "utf8", shell: true, timeout: 300_000 },
  );
  if (result.status !== 0) {
    throw new Error(`rules_deploy_failed:${String(result.stderr || result.stdout).slice(-500)}`);
  }
}

async function issuePermit(token, ownerUid, messageId) {
  const result = await jsonPost(
    `${DIRECT}/api/abuse/issue-send-permit`,
    token,
    { receptorUid: ownerUid, chatId, messageId },
  );
  assert.equal(result.response.status, 200, `permit status ${result.response.status}`);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.ipCoverage, "active");
  assert.ok(String(result.json.permitId || "").startsWith("prm_"));
  assert.equal(
    result.response.headers.get("access-control-allow-origin"),
    WEB,
    "direct API CORS must allow only the official web origin",
  );
  return String(result.json.permitId);
}

async function sendVisitorMessage(messageId, permitId) {
  const payload = buildProfileAnonAtomicSendBatch({
    messageText: "P0 production smoke",
    messageId,
    senderAuthorId: chatId.split("__anon_to__")[0],
    senderKind: "anon",
    senderRole: "anon",
    unreadRecipients: [owner.auth.currentUser.uid],
    latestSenderAnonSessionId: chatId.split("__anon_to__")[0],
    senderIsAnonymous: true,
    abuseSendPermitId: permitId,
  });
  const batch = writeBatch(visitor.db);
  batch.set(doc(visitor.db, "chats", chatId), payload.chatWritePayload, { merge: true });
  batch.set(
    doc(visitor.db, "chats", chatId, "mensajes", messageId),
    payload.messagePayload,
  );
  await batch.commit();
}

async function cleanup() {
  if (activeMessageId && chatId) {
    try {
      const remove = httpsCallable(visitor.functions, "deleteChatMessage");
      await remove({ chatId, messageId: activeMessageId });
    } catch {
      // Cleanup is best-effort; no token or document identifier is logged.
    }
  }
  if (!rulesDeployed && chatId) {
    try {
      await deleteDoc(doc(visitor.db, "chats", chatId));
    } catch {}
  }
  try {
    await deleteDoc(doc(owner.db, "usuarios", owner.auth.currentUser.uid));
  } catch {}
  for (const client of [owner, visitor, stranger]) {
    try {
      if (client.auth.currentUser) await deleteUser(client.auth.currentUser);
    } catch {}
    try {
      await deleteApp(client.app);
    } catch {}
  }
}

const report = {
  gate: "P0_PRODUCTION_RULES_ROLLOUT",
  pass: false,
  approved,
  verifyOnly,
  pre: {},
  post: {},
  deploy: "not_started",
  rollbackExecuted: false,
};

try {
  await Promise.all([
    signInAnonymously(owner.auth),
    signInAnonymously(visitor.auth),
    signInAnonymously(stranger.auth),
  ]);
  const ownerUid = owner.auth.currentUser.uid;
  const visitorToken = await visitor.auth.currentUser.getIdToken();

  await setDoc(doc(owner.db, "usuarios", ownerUid), {
    uid: ownerUid,
    username,
    usernameLower: username,
    createdAt: serverTimestamp(),
    fechaRegistro: serverTimestamp(),
    qaSynthetic: true,
  });

  const alias = await jsonPost(`${WEB}/api/anon-match/bind-alias`, visitorToken, {});
  assert.equal(alias.response.status, 200);
  assert.equal(alias.json.ok, true);
  const anonId = String(alias.json.anonId || "");
  assert.match(anonId, /^anon_/);
  chatId = `${anonId}__anon_to__${username}`;

  const bound = await jsonPost(
    `${DIRECT}/api/abuse/bind-visitor-session`,
    visitorToken,
    { receptorUid: ownerUid, chatId, username },
  );
  assert.equal(bound.response.status, 200, `bind status ${bound.response.status}`);
  assert.equal(bound.json.ok, true);
  assert.equal(bound.response.headers.get("access-control-allow-origin"), WEB);
  report.pre.secretAndDirectIp = "PASS";
  report.pre.serverIssuedAlias = "PASS";

  const preMessageId = `msg_pre_${stamp}`;
  activeMessageId = preMessageId;
  const prePermit = await issuePermit(visitorToken, ownerUid, preMessageId);
  await sendVisitorMessage(preMessageId, prePermit);
  assert.equal(
    (await getDoc(doc(owner.db, "chats", chatId, "mensajes", preMessageId))).exists(),
    true,
  );
  if (verifyOnly) {
    report.deploy = "verify_only_no_deploy";
    report.post.legitimateVisitorSend = "PASS";
    report.post.ownerRead = "PASS";
    await assert.rejects(
      getDoc(doc(stranger.db, "chats", chatId, "mensajes", preMessageId)),
    );
    report.post.strangerReadDenied = "PASS";
    await assert.rejects(
      setDoc(
        doc(visitor.db, "chats", chatId),
        { readBy: { [stranger.auth.currentUser.uid]: true } },
        { merge: true },
      ),
    );
    report.post.foreignReceiptWriteDenied = "PASS";
    report.pass = true;
    console.log(JSON.stringify(report));
    await cleanup();
    process.exit(0);
  }
  assert.equal(
    (await getDoc(doc(stranger.db, "chats", chatId, "mensajes", preMessageId))).exists(),
    true,
    "baseline must reproduce the open read before rollout",
  );
  report.pre.legitimateSend = "PASS";
  report.pre.openReadReproduced = "PASS";

  await deleteDoc(doc(visitor.db, "chats", chatId, "mensajes", preMessageId));
  activeMessageId = "";

  if (!approved) {
    report.deploy = "skipped_without_explicit_env";
    report.pass = true;
    console.log(JSON.stringify(report));
    await cleanup();
    process.exit(0);
  }

  deployRules("firebase.json");
  rulesDeployed = true;
  report.deploy = "strict_rules_deployed";

  const postMessageId = `msg_post_${stamp}`;
  activeMessageId = postMessageId;
  const postPermit = await issuePermit(visitorToken, ownerUid, postMessageId);
  await sendVisitorMessage(postMessageId, postPermit);
  assert.equal(
    (await getDoc(doc(owner.db, "chats", chatId, "mensajes", postMessageId))).exists(),
    true,
  );
  report.post.legitimateVisitorSend = "PASS";
  report.post.ownerRead = "PASS";

  await assert.rejects(
    getDoc(doc(stranger.db, "chats", chatId, "mensajes", postMessageId)),
  );
  report.post.strangerReadDenied = "PASS";

  await assert.rejects(
    setDoc(
      doc(visitor.db, "chats", chatId),
      { readBy: { [stranger.auth.currentUser.uid]: true } },
      { merge: true },
    ),
  );
  report.post.foreignReceiptWriteDenied = "PASS";

  report.pass = true;
  console.log(JSON.stringify(report));
} catch (error) {
  report.error = String(error?.message || error).slice(0, 500);
  if (rulesDeployed) {
    try {
      deployRules("firebase.p0-rollback-open.json");
      rollbackExecuted = true;
      rulesDeployed = false;
      report.deploy = "rolled_back_to_open_rules";
    } catch (rollbackError) {
      report.rollbackError = String(rollbackError?.message || rollbackError).slice(0, 500);
    }
  }
  report.rollbackExecuted = rollbackExecuted;
  console.error(JSON.stringify(report));
  process.exitCode = 1;
} finally {
  await cleanup();
}
