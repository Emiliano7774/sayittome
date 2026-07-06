/**
 * Prepare dedicated navigation benchmark account + storage state.
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_PATH in .env.local OR gcloud ADC.
 * Writes BENCH_EMAIL / BENCH_PASSWORD to .env.local when missing (never logs password).
 *
 * Usage: node scripts/bench-setup-account.mjs --base http://localhost:3002
 */

import { chromium, devices } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import os from "node:os";

const args = process.argv.slice(2);
const baseUrl = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3002";
const storageStateFile = path.join(process.cwd(), "scripts/bench-storage-state.json");
const envLocalPath = path.join(process.cwd(), ".env.local");

loadEnvLocal();

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sayittome-app";
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BENCH_USERNAME = "navbench";

function loadEnvLocal() {
  if (!fs.existsSync(envLocalPath)) return;
  const raw = fs.readFileSync(envLocalPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function appendEnvLocal(entries) {
  const lines = [];
  if (!fs.existsSync(envLocalPath)) {
    lines.push("# Local environment (never commit)");
  }
  for (const [key, value] of Object.entries(entries)) {
    lines.push(`${key}=${value}`);
    process.env[key] = value;
  }
  fs.appendFileSync(envLocalPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`bench-setup: appended ${Object.keys(entries).join(", ")} to .env.local`);
}

function readFirebaseCliAccessToken() {
  try {
    const configPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const token = config?.tokens?.access_token;
    const expiresAt = Number(config?.tokens?.expires_at || 0);
    if (token && expiresAt > Date.now()) return token;
  } catch {
    // ignore
  }
  return null;
}

async function ensureBenchUserViaRest(email, password) {
  const accessToken = readFirebaseCliAccessToken();
  if (!accessToken) {
    throw new Error("bench-setup: Firebase CLI access token missing or expired — run `firebase login`");
  }

  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: [email] }),
    },
  );

  let localId = "";
  if (lookupRes.ok) {
    const lookup = await lookupRes.json();
    localId = lookup?.users?.[0]?.localId || "";
  }

  if (!localId) {
    const createRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          emailVerified: true,
          displayName: BENCH_USERNAME,
        }),
      },
    );
    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`bench-setup: create user failed ${createRes.status} ${body}`);
    }
    const created = await createRes.json();
    localId = created.localId;
    console.log("bench-setup: created auth user via Identity REST");
  } else {
    const updateRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          localId,
          emailVerified: true,
          password,
          displayName: BENCH_USERNAME,
        }),
      },
    );
    if (!updateRes.ok) {
      const body = await updateRes.text();
      throw new Error(`bench-setup: update user failed ${updateRes.status} ${body}`);
    }
    console.log("bench-setup: updated auth user via Identity REST");
  }

  await upsertBenchProfileViaRest(localId, email, accessToken);
  await seedInboxChatViaRest(localId, accessToken);
  return localId;
}

async function upsertBenchProfileViaRest(uid, email, accessToken) {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/usuarios/${encodeURIComponent(uid)}`;
  const fields = {
    uid: { stringValue: uid },
    email: { stringValue: email },
    username: { stringValue: BENCH_USERNAME },
    usernameLower: { stringValue: BENCH_USERNAME },
    nombre: { stringValue: BENCH_USERNAME },
    bio: { stringValue: "Navigation performance benchmark account" },
    descripcion: { stringValue: "Navigation performance benchmark account" },
    pais: { stringValue: "AR" },
    provincia: { stringValue: "Buenos Aires" },
    mostrarProvincia: { booleanValue: false },
    profileSetupComplete: { booleanValue: true },
    perfilCompleto: { booleanValue: true },
  };

  const patchUrl = new URL(docUrl);
  Object.keys(fields).forEach((key) => patchUrl.searchParams.append("updateMask.fieldPaths", key));

  const res = await fetch(patchUrl.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`bench-setup: profile patch failed ${res.status} ${body}`);
  }
  console.log(`bench-setup: profile @${BENCH_USERNAME} ready (${uid})`);
}

async function seedInboxChatViaRest(benchUid, accessToken) {
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const queryRes = await fetch(queryUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "chats" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "participantes" },
            op: "ARRAY_CONTAINS",
            value: { stringValue: benchUid },
          },
        },
        limit: 1,
      },
    }),
  });

  if (queryRes.ok) {
    const rows = await queryRes.json();
    if (Array.isArray(rows) && rows.some((row) => row.document)) {
      console.log("bench-setup: inbox chat already exists");
      return;
    }
  }

  const peerQuery = await fetch(queryUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "usuarios" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "usernameLower" },
            op: "NOT_EQUAL",
            value: { stringValue: BENCH_USERNAME },
          },
        },
        limit: 1,
      },
    }),
  });

  let peerUid = "bench-peer-placeholder";
  let peerUsername = "benchpeer";
  if (peerQuery.ok) {
    const peerRows = await peerQuery.json();
    const peerDoc = peerRows.find((row) => row.document)?.document;
    if (peerDoc) {
      peerUid = peerDoc.name.split("/").pop() || peerUid;
      const fields = peerDoc.fields || {};
      peerUsername = fields.username?.stringValue || fields.usernameLower?.stringValue || peerUsername;
    }
  }

  const chatId = crypto.randomBytes(12).toString("hex");
  const chatUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/chats?documentId=${chatId}`;
  const res = await fetch(chatUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        participantes: {
          arrayValue: { values: [{ stringValue: benchUid }, { stringValue: peerUid }] },
        },
        targetUid: { stringValue: peerUid },
        receptorUid: { stringValue: benchUid },
        targetUsername: { stringValue: peerUsername },
        receptorUsername: { stringValue: BENCH_USERNAME },
        lastMessage: { stringValue: "bench inbox seed" },
        lastMessageSender: { stringValue: peerUid },
        readBy: {
          mapValue: {
            fields: {
              [benchUid]: { booleanValue: true },
              [peerUid]: { booleanValue: true },
            },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`bench-setup: chat seed failed ${res.status} ${body}`);
  }
  console.log("bench-setup: seeded inbox chat");
}

async function initFirebaseAdmin() {
  if (admin.getApps().length) return admin.getApp();

  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (saPath && fs.existsSync(saPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(saPath, "utf8"));
    return admin.initializeApp({
      credential: admin.cert(serviceAccount),
      projectId,
    });
  }

  try {
    return admin.initializeApp({
      credential: admin.applicationDefault(),
      projectId,
    });
  } catch {
    throw new Error(
      "bench-setup: set FIREBASE_SERVICE_ACCOUNT_PATH in .env.local or run gcloud auth application-default login",
    );
  }
}

async function ensureBenchCredentials() {
  let email = process.env.BENCH_EMAIL;
  let password = process.env.BENCH_PASSWORD;

  if (!email || !password) {
    email = `navbench+${projectId}@example.com`;
    password = crypto.randomBytes(24).toString("base64url");
    appendEnvLocal({ BENCH_EMAIL: email, BENCH_PASSWORD: password });
  }

  return { email, password };
}

async function ensureBenchUser(adminApp, email, password) {
  const auth = getAuth(adminApp);
  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { emailVerified: true, password });
  } catch (error) {
    if (String(error?.code || error?.errorInfo?.code) !== "auth/user-not-found") throw error;
    user = await auth.createUser({
      email,
      password,
      emailVerified: true,
      displayName: BENCH_USERNAME,
    });
    console.log("bench-setup: created auth user");
  }

  const db = getFirestore(adminApp);
  const profileRef = db.collection("usuarios").doc(user.uid);
  const existing = await profileRef.get();
  const payload = {
    uid: user.uid,
    email,
    username: BENCH_USERNAME,
    usernameLower: BENCH_USERNAME,
    nombre: BENCH_USERNAME,
    bio: "Navigation performance benchmark account",
    descripcion: "Navigation performance benchmark account",
    pais: "AR",
    provincia: "Buenos Aires",
    mostrarProvincia: false,
    profileSetupComplete: true,
    perfilCompleto: true,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!existing.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.originalCreatedAt = FieldValue.serverTimestamp();
  }
  await profileRef.set(payload, { merge: true });
  console.log(`bench-setup: profile @${BENCH_USERNAME} ready (${user.uid})`);

  await seedInboxChat(db, user.uid);
  return user.uid;
}

async function seedInboxChat(db, benchUid) {
  const existing = await db
    .collection("chats")
    .where("participantes", "array-contains", benchUid)
    .limit(1)
    .get();

  if (!existing.empty) {
    console.log("bench-setup: inbox chat already exists");
    return;
  }

  const peerSnap = await db.collection("usuarios").where("usernameLower", "!=", BENCH_USERNAME).limit(1).get();
  let peerUid = "bench-peer-placeholder";
  let peerUsername = "benchpeer";
  if (!peerSnap.empty) {
    const peer = peerSnap.docs[0].data();
    peerUid = String(peer.uid || peerSnap.docs[0].id);
    peerUsername = String(peer.username || peer.usernameLower || "benchpeer");
  }

  const chatRef = db.collection("chats").doc();
  await chatRef.set({
    participantes: [benchUid, peerUid],
    targetUid: peerUid,
    receptorUid: benchUid,
    targetUsername: peerUsername,
    receptorUsername: BENCH_USERNAME,
    lastMessage: "bench inbox seed",
    lastMessageSender: peerUid,
    readBy: { [benchUid]: true, [peerUid]: true },
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log("bench-setup: seeded inbox chat");
}

async function dismissOverlays(page) {
  const language = page.locator('[aria-labelledby="language-prompt-title"]');
  if (await language.isVisible({ timeout: 500 }).catch(() => false)) {
    await page
      .locator('[aria-labelledby="language-prompt-title"] button')
      .first()
      .click({ force: true });
  }
  const notif = page.getByRole("button", { name: /Ahora no|Not now/i });
  if (await notif.isVisible({ timeout: 500 }).catch(() => false)) {
    await notif.click({ force: true });
  }
}

async function saveStorageState(email, password) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices["Pixel 5"], locale: "es-AR" });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem("sayittome_locale_prompt_done", "1");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissOverlays(page);
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('form button[type="submit"], form button:not([type="button"])').first().click();
  await page.waitForURL(/\/(shuffle|chats|settings|boost|stories|register)/, { timeout: 60000 });

  if (page.url().includes("/register")) {
    throw new Error("bench-setup: login redirected to register — profile incomplete");
  }

  await page.goto(`${baseUrl}/chats`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  await context.storageState({ path: storageStateFile });
  await browser.close();
  console.log(`bench-setup: wrote ${storageStateFile}`);
}

async function main() {
  if (!apiKey) throw new Error("bench-setup: NEXT_PUBLIC_FIREBASE_API_KEY missing from .env.local");

  const { email, password } = await ensureBenchCredentials();
  try {
    await ensureBenchUserViaRest(email, password);
  } catch (restError) {
    console.warn("bench-setup: REST admin path failed, trying firebase-admin:", String(restError));
    const adminApp = await initFirebaseAdmin();
    await ensureBenchUser(adminApp, email, password);
  }
  await saveStorageState(email, password);
  console.log("bench-setup: done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
