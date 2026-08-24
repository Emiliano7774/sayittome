/**
 * Prod canary: Identity Toolkit anonymous sign-in + Storage chat/profile uploads.
 * Always cleans Storage objects and Auth users created by this run (try/finally).
 * Storage deletes use privileged GCS (client rules deny delete); Auth via client
 * deleteUser, with Admin deleteUser fallback when a service account is available.
 * Sanitized stage/ok/code only — no tokens.
 *
 * Usage: node scripts/anon-storage-prod-canary.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInAnonymously,
} from "firebase/auth";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk",
  authDomain: "sayittome-app.firebaseapp.com",
  projectId: "sayittome-app",
  storageBucket: "sayittome-app.firebasestorage.app",
  messagingSenderId: "676263895580",
  appId: "1:676263895580:web:2c7ffa7827c2a4799f35d9",
};

const BUCKET = firebaseConfig.storageBucket;
const app = initializeApp(firebaseConfig, `anon-storage-canary-${Date.now()}`);
const auth = getAuth(app);
const storage = getStorage(app);
const stamp = Date.now().toString(36);
const results = [];
/** @type {string[]} */
const uploadedPaths = [];
/** @type {Set<string>} */
const createdUids = new Set();

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function row(stage, ok, extra = {}) {
  const r = { stage, ok, ...extra };
  results.push(r);
  console.log(JSON.stringify(r));
  return r;
}

function resolveServiceAccountPath() {
  let saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "";
  if (!saPath && existsSync(".env.local")) {
    const env = readFileSync(".env.local", "utf8");
    const m = env.match(/FIREBASE_SERVICE_ACCOUNT_PATH\s*=\s*(.+)/);
    if (m) saPath = m[1].trim().replace(/^["']|["']$/g, "");
  }
  return saPath && existsSync(saPath) ? saPath : "";
}

function getAdminAuth() {
  const saPath = resolveServiceAccountPath();
  if (!saPath) return null;
  const require = createRequire(import.meta.url);
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(readFileSync(saPath, "utf8"))),
    });
  }
  return admin.auth();
}

/** Privileged GCS delete — Storage security rules deny client deletes. */
function readFirebaseCliAccessToken() {
  const credPath = join(homedir(), ".config", "configstore", "firebase-tools.json");
  if (!existsSync(credPath)) return "";
  try {
    const j = JSON.parse(readFileSync(credPath, "utf8"));
    return String(j?.tokens?.access_token || "").trim();
  } catch {
    return "";
  }
}

async function deleteStorageObjectPrivileged(objectPath) {
  const token = readFirebaseCliAccessToken();
  if (!token) {
    throw Object.assign(new Error("missing_firebase_cli_token"), {
      code: "cleanup/no_token",
    });
  }
  const encoded = encodeURIComponent(objectPath);
  const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encoded}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204 || res.status === 404) return;
  const body = await res.text();
  throw Object.assign(new Error(body.slice(0, 160) || `http_${res.status}`), {
    code: `cleanup/http_${res.status}`,
  });
}

async function uploadTracked(stage, objectPath, bytes, contentType) {
  try {
    const storageRef = ref(storage, objectPath);
    await uploadBytes(storageRef, bytes, { contentType });
    uploadedPaths.push(objectPath);
    const url = await getDownloadURL(storageRef);
    row(stage, true, {
      pathKind: objectPath.split("/")[0],
      urlHost: new URL(url).host,
    });
  } catch (error) {
    row(stage, false, {
      code: String(error?.code || ""),
      message: String(error?.message || "").slice(0, 120),
    });
  }
}

async function cleanupStorageObjects() {
  const unique = [...new Set(uploadedPaths)];
  let deleted = 0;
  let failed = 0;
  for (const objectPath of unique) {
    try {
      await deleteStorageObjectPrivileged(objectPath);
      deleted += 1;
    } catch (error) {
      failed += 1;
      row("cleanup_storage_item", false, {
        pathKind: objectPath.split("/")[0],
        code: String(error?.code || ""),
        message: String(error?.message || "").slice(0, 80),
      });
    }
  }
  row("cleanup_storage", failed === 0, {
    tracked: unique.length,
    deleted,
    failed,
  });
}

async function cleanupAuthUsers() {
  const uids = [...createdUids];
  let deleted = 0;
  let failed = 0;
  const current = auth.currentUser;

  if (current && createdUids.has(current.uid)) {
    try {
      await deleteUser(current);
      createdUids.delete(current.uid);
      deleted += 1;
    } catch {
      /* Admin fallback below */
    }
  }

  const remaining = [...createdUids];
  if (remaining.length) {
    const adminAuth = getAdminAuth();
    if (adminAuth) {
      for (const uid of remaining) {
        try {
          await adminAuth.deleteUser(uid);
          createdUids.delete(uid);
          deleted += 1;
        } catch (error) {
          const code = String(error?.code || error?.errorInfo?.code || "");
          if (code === "auth/user-not-found") {
            createdUids.delete(uid);
            deleted += 1;
          } else {
            failed += 1;
          }
        }
      }
    } else {
      failed += remaining.length;
      row("cleanup_auth", false, {
        tracked: uids.length,
        deleted,
        failed,
        note: "no_service_account_for_orphan_uids",
      });
      return;
    }
  }

  row("cleanup_auth", failed === 0, {
    tracked: uids.length,
    deleted,
    failed,
  });
}

let exitCode = 2;
try {
  try {
    const cred = await signInAnonymously(auth);
    createdUids.add(cred.user.uid);
    row("signInAnonymously", true, {
      isAnonymous: cred.user.isAnonymous === true,
    });
  } catch (error) {
    row("signInAnonymously", false, {
      code: String(error?.code || ""),
      message: String(error?.message || "").slice(0, 120),
    });
    throw error;
  }

  const chatId = `canary_anon_${stamp}__canary_profile`;
  await uploadTracked(
    "upload_gallery",
    `chats/${chatId}/gallery_${stamp}_jpg`,
    PNG,
    "image/jpeg",
  );
  await uploadTracked(
    "upload_bomb",
    `chats/${chatId}/bomb_${stamp}_jpg`,
    PNG,
    "image/jpeg",
  );
  await uploadTracked(
    "upload_audio",
    `chats/${chatId}/audio_${stamp}_webm`,
    new Uint8Array([1, 2, 3, 4]),
    "audio/webm",
  );

  // Remove anonymous user before profile signup so it is not orphaned.
  const anonUser = auth.currentUser;
  if (anonUser?.isAnonymous) {
    const anonUid = anonUser.uid;
    try {
      await deleteUser(anonUser);
      createdUids.delete(anonUid);
      row("cleanup_anon_before_profile", true, {});
    } catch (error) {
      row("cleanup_anon_before_profile", false, {
        code: String(error?.code || ""),
        message: String(error?.message || "").slice(0, 120),
      });
    }
  }

  try {
    const email = `canary_profile_${stamp}@example.invalid`;
    const profileCred = await createUserWithEmailAndPassword(
      auth,
      email,
      "TestPass123!",
    );
    createdUids.add(profileCred.user.uid);
    await uploadTracked(
      "upload_profile_registered",
      `usuarios/${profileCred.user.uid}/perfil/canary_${stamp}.jpg`,
      PNG,
      "image/jpeg",
    );
  } catch (error) {
    row("upload_profile_registered", false, {
      code: String(error?.code || ""),
      message: String(error?.message || "").slice(0, 120),
    });
  }

  const required = [
    "signInAnonymously",
    "upload_gallery",
    "upload_bomb",
    "upload_audio",
    "upload_profile_registered",
  ];
  const pass = required.every((stage) => results.find((r) => r.stage === stage)?.ok);
  exitCode = pass ? 0 : 2;
} catch {
  exitCode = 2;
} finally {
  try {
    await cleanupStorageObjects();
    await cleanupAuthUsers();
  } catch (error) {
    row("cleanup_fatal", false, {
      code: String(error?.code || ""),
      message: String(error?.message || "").slice(0, 120),
    });
    exitCode = 2;
  }

  const cleanupOk =
    results.find((r) => r.stage === "cleanup_storage")?.ok === true &&
    results.find((r) => r.stage === "cleanup_auth")?.ok === true;
  if (!cleanupOk) exitCode = 2;

  console.log(
    JSON.stringify(
      {
        gate: "ANON_STORAGE_PROD_CANARY",
        pass: exitCode === 0,
        results,
      },
      null,
      2,
    ),
  );
  process.exit(exitCode);
}
