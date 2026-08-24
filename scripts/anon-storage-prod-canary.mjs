/**
 * Prod canary: Identity Toolkit anonymous sign-in + Storage chat/profile uploads.
 * Sanitized stage/ok/code only — no tokens.
 *
 * Usage: node scripts/anon-storage-prod-canary.mjs
 */
import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInAnonymously,
} from "firebase/auth";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk",
  authDomain: "sayittome-app.firebaseapp.com",
  projectId: "sayittome-app",
  storageBucket: "sayittome-app.firebasestorage.app",
  messagingSenderId: "676263895580",
  appId: "1:676263895580:web:2c7ffa7827c2a4799f35d9",
};

const app = initializeApp(firebaseConfig, `anon-storage-canary-${Date.now()}`);
const auth = getAuth(app);
const storage = getStorage(app);
const stamp = Date.now().toString(36);
const results = [];

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

async function uploadThenDelete(stage, objectPath, bytes, contentType) {
  try {
    const storageRef = ref(storage, objectPath);
    await uploadBytes(storageRef, bytes, { contentType });
    const url = await getDownloadURL(storageRef);
    row(stage, true, {
      pathKind: objectPath.split("/")[0],
      urlHost: new URL(url).host,
    });
    await deleteObject(storageRef).catch(() => {});
  } catch (error) {
    row(stage, false, {
      code: String(error?.code || ""),
      message: String(error?.message || "").slice(0, 120),
    });
  }
}

try {
  const cred = await signInAnonymously(auth);
  row("signInAnonymously", true, {
    isAnonymous: cred.user.isAnonymous === true,
  });
} catch (error) {
  row("signInAnonymously", false, {
    code: String(error?.code || ""),
    message: String(error?.message || "").slice(0, 120),
  });
  console.log(
    JSON.stringify({ gate: "ANON_STORAGE_PROD_CANARY", pass: false, results }, null, 2),
  );
  process.exit(2);
}

const chatId = `canary_anon_${stamp}__canary_profile`;
await uploadThenDelete(
  "upload_gallery",
  `chats/${chatId}/gallery_${stamp}_jpg`,
  PNG,
  "image/jpeg",
);
await uploadThenDelete(
  "upload_bomb",
  `chats/${chatId}/bomb_${stamp}_jpg`,
  PNG,
  "image/jpeg",
);
await uploadThenDelete(
  "upload_audio",
  `chats/${chatId}/audio_${stamp}_webm`,
  new Uint8Array([1, 2, 3, 4]),
  "audio/webm",
);

try {
  const email = `canary_profile_${stamp}@example.invalid`;
  await createUserWithEmailAndPassword(auth, email, "TestPass123!");
  const uid = auth.currentUser?.uid || "";
  await uploadThenDelete(
    "upload_profile_registered",
    `usuarios/${uid}/perfil/canary_${stamp}.jpg`,
    PNG,
    "image/jpeg",
  );
} catch (error) {
  row("upload_profile_registered", false, {
    code: String(error?.code || ""),
    message: String(error?.message || "").slice(0, 120),
  });
}

const pass = results.every((r) => r.ok);
console.log(JSON.stringify({ gate: "ANON_STORAGE_PROD_CANARY", pass, results }, null, 2));
process.exit(pass ? 0 : 2);
