import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIRESTORE_PROJECT_ID = "sayittome-app";
const FIRESTORE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const apply = process.argv.includes("--apply");
const dryRun = !apply;

function parseFirestoreValue(field) {
  if (!field) return undefined;
  if ("stringValue" in field) return field.stringValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("mapValue" in field) {
    const fields = field.mapValue?.fields || {};
    const map = {};
    for (const [key, value] of Object.entries(fields)) {
      map[key] = parseFirestoreValue(value);
    }
    return map;
  }
  return undefined;
}

function parseFirestoreDoc(doc) {
  const fields = doc?.fields || {};
  const parsed = {
    id: String(doc.name || "").split("/").pop() || "",
  };
  for (const [key, value] of Object.entries(fields)) {
    parsed[key] = parseFirestoreValue(value);
  }
  return parsed;
}

function hasBlurFlags(user) {
  const flags = user.mediaBlurFlags;
  if (!flags || typeof flags !== "object") return false;
  return Object.values(flags).some((value) => value === true);
}

function hasManualAdminBlur(user) {
  const adminBlurBy = String(user.adminBlurBy || "").trim();
  return adminBlurBy.includes("@");
}

function shouldClearAutoBlur(user) {
  if (hasManualAdminBlur(user)) return false;

  const reason = String(user.adminBlurReason || "").trim();
  if (reason === "auto_nsfw") return true;
  if (hasBlurFlags(user)) return true;
  if (user.adminBlurProfilePhoto === true || user.adminBlurFotosPerfil === true) return true;

  return false;
}

async function runCollectionQuery(collectionId, pageToken = "") {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        limit: 500,
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

async function clearAutoBlur(uid) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/usuarios/${encodeURIComponent(uid)}`,
  );
  url.searchParams.set("key", FIRESTORE_API_KEY);

  for (const field of [
    "mediaBlurFlags",
    "adminBlurProfilePhoto",
    "adminBlurFotosPerfil",
    "adminBlurGallery",
    "adminBlurReason",
    "adminBlurAt",
  ]) {
    url.searchParams.append("updateMask.fieldPaths", field);
  }

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        mediaBlurFlags: { mapValue: { fields: {} } },
        adminBlurProfilePhoto: { booleanValue: false },
        adminBlurFotosPerfil: { booleanValue: false },
        adminBlurGallery: { booleanValue: false },
        adminBlurReason: { stringValue: "" },
        adminBlurAt: { stringValue: "" },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`patch usuarios/${uid} ${res.status}`);
  }
}

async function main() {
  console.log(dryRun ? "Dry run — no writes" : "Applying cleanup");

  const users = await runCollectionQuery("usuarios");
  const targets = users.filter(shouldClearAutoBlur);

  console.log(`Scanned ${users.length} users, ${targets.length} with auto blur to clear`);

  for (const user of targets.slice(0, 40)) {
    console.log(
      `- ${user.username || user.id}: reason=${user.adminBlurReason || "-"} flags=${hasBlurFlags(user)}`,
    );
  }
  if (targets.length > 40) {
    console.log(`... and ${targets.length - 40} more`);
  }

  if (dryRun) {
    console.log("Run with --apply to clear auto blur penalties.");
    return;
  }

  let cleared = 0;
  for (const user of targets) {
    await clearAutoBlur(user.id);
    cleared += 1;
  }

  console.log(`Cleared auto blur on ${cleared} profiles.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
