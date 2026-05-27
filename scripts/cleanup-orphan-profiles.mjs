import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const FIRESTORE_PROJECT_ID = "sayittome-app";
const FIRESTORE_API_KEY = "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const adminEmail = "emilianomaturano@gmail.com";
const dryRun = process.argv.includes("--dry-run");

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
  const parsed = { id: String(doc.name || "").split("/").pop() || "" };
  for (const [key, value] of Object.entries(fields)) {
    parsed[key] = parseFirestoreValue(value);
  }
  return parsed;
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function isValidUsername(value) {
  const clean = normalizeUsername(value);
  return /^[a-zA-Z0-9._-]{3,24}$/.test(clean);
}

function getIssues(user) {
  const issues = [];
  const uid = String(user.uid || user.id || "").trim();
  const username = normalizeUsername(user.username || user.nombre || "");
  const usernameLower = String(user.usernameLower || "").trim().toLowerCase();
  const provincia = String(user.provincia || "").trim();

  if (!uid) issues.push("missing_uid");
  if (!username) issues.push("missing_username");
  if (username && !isValidUsername(username)) issues.push("invalid_username");
  if (username.toLowerCase() === "usuario") issues.push("placeholder_username");
  if (!usernameLower) issues.push("missing_username_lower");
  if (username && usernameLower && usernameLower !== username.toLowerCase()) {
    issues.push("username_lower_mismatch");
  }
  if (!provincia) issues.push("missing_provincia");
  const legacyComplete =
    isValidUsername(username) &&
    !!usernameLower &&
    usernameLower === username.toLowerCase() &&
    !!provincia;
  if (user.profileSetupComplete !== true && !legacyComplete) issues.push("setup_incomplete");
  return issues;
}

async function fetchWithRetry(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function runCollectionQuery(collectionId, limit = 500) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId }], limit },
    }),
  });
  if (!res.ok) throw new Error(`runQuery ${collectionId} ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) return [];
  return json.map((row) => row.document).filter(Boolean).map(parseFirestoreDoc);
}

async function deleteDoc(collection, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?key=${FIRESTORE_API_KEY}`;
  const res = await fetchWithRetry(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete ${collection}/${id} ${res.status}`);
}

async function patchDoc(collection, id, fields) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,
  );
  url.searchParams.set("key", FIRESTORE_API_KEY);
  for (const key of Object.keys(fields)) {
    url.searchParams.append("updateMask.fieldPaths", key);
  }

  const bodyFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "boolean") bodyFields[key] = { booleanValue: value };
    else bodyFields[key] = { stringValue: String(value) };
  }

  const res = await fetchWithRetry(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: bodyFields }),
  });
  if (!res.ok) throw new Error(`patch ${collection}/${id} ${res.status}`);
}

function storiesByOwner(stories) {
  const map = new Map();
  for (const story of stories) {
    const owner = String(story.ownerUid || story.uid || "");
    if (!owner) continue;
    if (!map.has(owner)) map.set(owner, []);
    map.get(owner).push(story);
  }
  return map;
}

function followsByUid(follows) {
  const map = new Map();
  for (const row of follows) {
    for (const uid of [String(row.seguidorUid || ""), String(row.seguidoUid || "")]) {
      if (!uid) continue;
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid).push(row);
    }
  }
  return map;
}

async function disableStoriesForUid(uid, storyMap) {
  const stories = storyMap.get(uid) || [];
  for (const story of stories) {
    await patchDoc("historias", String(story.id), {
      active: false,
      adminDeleted: true,
      adminDisabled: true,
    });
  }
  return stories.length;
}

async function deleteFollowEdgesForUid(uid, followMap) {
  const rows = followMap.get(uid) || [];
  const seen = new Set();
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    await deleteDoc("seguidores", id);
  }
  return seen.size;
}

const [users, allStories, allFollows] = await Promise.all([
  runCollectionQuery("usuarios", 500),
  runCollectionQuery("historias", 500),
  runCollectionQuery("seguidores", 500),
]);
const storyMap = storiesByOwner(allStories);
const followMap = followsByUid(allFollows);
const orphans = users
  .map((user) => ({
    uid: String(user.uid || user.id || ""),
    username: String(user.username || user.usernameLower || user.nombre || ""),
    email: String(user.email || ""),
    issues: getIssues(user).join(", "),
  }))
  .filter((row) => row.uid && row.issues);

console.log(`Perfiles huérfanos detectados: ${orphans.length}`);
if (orphans.length > 0) console.table(orphans.slice(0, 40));

if (dryRun) {
  console.log("Dry run: no se eliminó nada.");
  process.exit(0);
}

let deleted = 0;
for (const orphan of orphans) {
  const stories = await disableStoriesForUid(orphan.uid, storyMap);
  const follows = await deleteFollowEdgesForUid(orphan.uid, followMap);
  await deleteDoc("usuarios", orphan.uid);
  deleted += 1;
  console.log(`Eliminado ${orphan.username || orphan.uid} (stories=${stories}, follows=${follows})`);
}

console.log(`Listo. Eliminados ${deleted} perfiles huérfanos.`);
