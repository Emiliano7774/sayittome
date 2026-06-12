import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const FIRESTORE_PROJECT_ID = "sayittome-app";
const FIRESTORE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");

function parseFirestoreValue(field) {
  if (!field) return undefined;
  if ("stringValue" in field) return field.stringValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return field.doubleValue;
  if ("timestampValue" in field) return field.timestampValue;
  return undefined;
}

function parseFirestoreDoc(doc) {
  const fields = doc?.fields || {};
  const parsed = {
    id: String(doc.name || "").split("/").pop() || "",
    _firestoreCreateTime: doc.createTime || "",
  };
  for (const [key, value] of Object.entries(fields)) {
    parsed[key] = parseFirestoreValue(value);
  }
  return parsed;
}

function resolveCreatedAt(user) {
  const candidates = [];
  for (const key of [
    "originalCreatedAt",
    "createdAt",
    "fechaCreacion",
    "fechaRegistro",
    "_firestoreCreateTime",
  ]) {
    const value = String(user[key] || "").trim();
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) candidates.push(date);
  }
  if (!candidates.length) return null;
  return new Date(Math.min(...candidates.map((date) => date.getTime())));
}

async function runCollectionQuery(collectionId, limit = 500) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        limit,
      },
    }),
  });
  const json = await res.json();
  if (!Array.isArray(json)) return [];
  return json
    .map((row) => row.document)
    .filter(Boolean)
    .map(parseFirestoreDoc);
}

async function patchUser(uid, createdAtIso, originalCreatedAtIso) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/usuarios/${encodeURIComponent(uid)}`,
  );
  url.searchParams.set("key", FIRESTORE_API_KEY);
  url.searchParams.append("updateMask.fieldPaths", "createdAt");
  url.searchParams.append("updateMask.fieldPaths", "originalCreatedAt");

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        createdAt: { timestampValue: createdAtIso },
        originalCreatedAt: { timestampValue: originalCreatedAtIso },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`patch ${uid} ${res.status}`);
  }
}

const users = await runCollectionQuery("usuarios", 500);
let needsPatch = 0;
let patched = 0;

for (const user of users) {
  const uid = String(user.uid || user.id || "").trim();
  if (!uid) continue;

  const trueCreatedAt = resolveCreatedAt(user);
  if (!trueCreatedAt) continue;

  const current = String(user.createdAt || "");
  const currentMs = new Date(current).getTime();
  const trueMs = trueCreatedAt.getTime();
  const shouldPatch = !current || Number.isNaN(currentMs) || Math.abs(currentMs - trueMs) > 60_000;
  if (!shouldPatch) continue;

  needsPatch += 1;
  console.log(
    `${dryRun || !apply ? "[dry-run]" : "[patch]"} @${user.username || uid} ${current || "(empty)"} -> ${trueCreatedAt.toISOString()} (firestore=${user._firestoreCreateTime || "-"})`,
  );

  if (apply && !dryRun) {
    await patchUser(uid, trueCreatedAt.toISOString(), String(user.originalCreatedAt || trueCreatedAt.toISOString()));
    patched += 1;
  }
}

console.log(`\nScanned: ${users.length}`);
console.log(`Needs patch: ${needsPatch}`);
console.log(`Patched: ${patched}`);
if (!apply && !dryRun) {
  console.log("\nUse --dry-run to preview or --apply to write changes.");
}
