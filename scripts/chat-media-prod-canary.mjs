/**
 * Prod canary: real Firestore client writes (auth optional).
 * Sanitized stage/op/path/code only.
 */
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const firebaseConfig = {
  apiKey: "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk",
  authDomain: "sayittome-app.firebaseapp.com",
  projectId: "sayittome-app",
  storageBucket: "sayittome-app.firebasestorage.app",
  messagingSenderId: "676263895580",
  appId: "1:676263895580:web:2c7ffa7827c2a4799f35d9",
};

const app = initializeApp(firebaseConfig, `canary-${Date.now()}`);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");

function sanitizeError(error) {
  return {
    code: String(error?.code || ""),
    message: String(error?.message || "").slice(0, 180),
  };
}

async function stage(name, op, path, fn) {
  const started = Date.now();
  try {
    await fn();
    const row = { stage: name, op, path, ok: true, ms: Date.now() - started };
    console.log(JSON.stringify(row));
    return row;
  } catch (error) {
    const row = {
      stage: name,
      op,
      path,
      ok: false,
      ms: Date.now() - started,
      ...sanitizeError(error),
    };
    console.log(JSON.stringify(row));
    return row;
  }
}

async function ensureAuth() {
  // Prefer custom token via Admin SA when anonymous provider is locked down for Node.
  const envPath = ".env.local";
  let saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "";
  if (!saPath && existsSync(envPath)) {
    const env = readFileSync(envPath, "utf8");
    const m = env.match(/FIREBASE_SERVICE_ACCOUNT_PATH\s*=\s*(.+)/);
    if (m) saPath = m[1].trim().replace(/^["']|["']$/g, "");
  }
  if (saPath && existsSync(saPath)) {
    const require = createRequire(import.meta.url);
    const admin = require("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(readFileSync(saPath, "utf8"))),
      });
    }
    const uid = `canary_${Date.now().toString(36)}`;
    const token = await admin.auth().createCustomToken(uid);
    await signInWithCustomToken(auth, token);
    return { mode: "customToken", uid };
  }

  try {
    const cred = await signInAnonymously(auth);
    return { mode: "anonymous", uid: cred.user.uid };
  } catch (error) {
    return {
      mode: "none",
      uid: "",
      authError: sanitizeError(error),
    };
  }
}

const results = [];
const authInfo = await ensureAuth();
results.push({
  stage: "auth",
  op: authInfo.mode,
  path: "auth",
  ok: Boolean(authInfo.uid) || authInfo.mode === "none",
  ...authInfo.authError,
  note: authInfo.mode === "none" ? "continuing_unauthenticated_catch_all" : undefined,
});
console.log(JSON.stringify(results[0]));

const uid = authInfo.uid || "unauth";
const stamp = Date.now().toString(36);
const chatId = `canary_${stamp}__canary_profile`;
const chatPath = `chats/${chatId}`;
const msgPath = `chats/${chatId}/mensajes`;

results.push(
  await stage("chat_meta_create", "setDoc.merge", chatPath, async () => {
    await setDoc(
      doc(db, "chats", chatId),
      {
        id: chatId,
        participantes: [uid, `anon_${stamp}`],
        anon: true,
        schemaVersion: 2,
        canary: true,
        canaryAt: serverTimestamp(),
        lastMessage: "canary",
      },
      { merge: true },
    );
  }),
);

const msgRef = doc(collection(db, "chats", chatId, "mensajes"));
results.push(
  await stage("message_gallery", "setDoc", `${msgPath}/{id}`, async () => {
    await setDoc(msgRef, {
      texto: "",
      type: "image",
      source: "gallery",
      mediaUrl: "https://example.invalid/canary.jpg",
      fromUid: `anon_${stamp}`,
      createdByAuthUid: uid === "unauth" ? null : uid,
      senderAuthUid: uid === "unauth" ? null : uid,
      senderRole: "anon",
      senderKind: "anon",
      createdAt: serverTimestamp(),
      canary: true,
      viewOnce: false,
    });
  }),
);

const bombRef = doc(collection(db, "chats", chatId, "mensajes"));
results.push(
  await stage("message_bomb_birth", "setDoc", `${msgPath}/{id}`, async () => {
    await setDoc(bombRef, {
      texto: "",
      type: "image",
      source: "camera",
      fromUid: `anon_${stamp}`,
      createdByAuthUid: uid === "unauth" ? null : uid,
      senderAuthUid: uid === "unauth" ? null : uid,
      senderRole: "anon",
      senderKind: "anon",
      createdAt: serverTimestamp(),
      canary: true,
      viewOnce: true,
      viewOnceLimit: 3,
      viewOnceOpenedCount: 0,
      viewOnceExhausted: false,
      viewOnceSealed: false,
    });
  }),
);

results.push(
  await stage("batch_meta_plus_message", "writeBatch", `${chatPath}+mensajes`, async () => {
    const batch = writeBatch(db);
    const mid = doc(collection(db, "chats", chatId, "mensajes"));
    batch.set(
      doc(db, "chats", chatId),
      { lastMessage: "canary-batch", updatedAt: serverTimestamp() },
      { merge: true },
    );
    batch.set(mid, {
      texto: "canary-text",
      type: "text",
      fromUid: `anon_${stamp}`,
      createdByAuthUid: uid === "unauth" ? null : uid,
      createdAt: serverTimestamp(),
      canary: true,
    });
    await batch.commit();
  }),
);

results.push(
  await stage("secrets_client_deny", "setDoc", "viewOnceSecrets/{id}", async () => {
    await setDoc(doc(db, "viewOnceSecrets", `${chatId}__deny`), {
      mediaUrl: "https://example.invalid/forged",
    });
  }),
);

if (authInfo.uid) {
  results.push(
    await stage("commitViewOnceSecret", "httpsCallable", "commitViewOnceSecret", async () => {
      const call = httpsCallable(functions, "commitViewOnceSecret");
      await call({
        chatId,
        messageId: bombRef.id,
        mediaUrl: "https://example.invalid/canary-bomb.jpg",
      });
    }),
  );
} else {
  results.push({
    stage: "commitViewOnceSecret",
    op: "httpsCallable",
    path: "commitViewOnceSecret",
    ok: false,
    code: "skipped",
    message: "no_auth_for_callable",
  });
  console.log(JSON.stringify(results[results.length - 1]));
}

results.push(
  await stage("chat_meta_read", "getDoc", chatPath, async () => {
    const snap = await getDoc(doc(db, "chats", chatId));
    if (!snap.exists()) throw Object.assign(new Error("missing"), { code: "not-found" });
  }),
);

for (const ref of [msgRef, bombRef]) {
  try {
    await deleteDoc(ref);
  } catch {
    /* ignore */
  }
}

const expectedDeny = results.find((r) => r.stage === "secrets_client_deny");
const requiredOk = [
  "chat_meta_create",
  "message_gallery",
  "message_bomb_birth",
  "batch_meta_plus_message",
  "chat_meta_read",
];
const summary = {
  gate: "CHAT_MEDIA_PROD_CANARY",
  pass:
    requiredOk.every((s) => results.find((r) => r.stage === s)?.ok) &&
    expectedDeny &&
    expectedDeny.ok === false &&
    String(expectedDeny.code || "").includes("permission-denied"),
  authMode: authInfo.mode,
  failedStages: results
    .filter((r) => !r.ok && r.stage !== "secrets_client_deny")
    .map((r) => ({ stage: r.stage, code: r.code, message: r.message })),
  results,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.pass ? 0 : 2);
