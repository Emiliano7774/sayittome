/**
 * Idempotent repair: add senderAuthUid/senderProfileId/senderRole from unambiguous fromUid.
 * Does NOT rewrite fromUid except profile_unknown → profile_{chat.targetUid}.
 * Never invents authors. Default is dry-run.
 *
 * Usage:
 *   node scripts/repair-chat-message-sender-fields.mjs --dry-run --limit-chats=50
 *   node scripts/repair-chat-message-sender-fields.mjs --apply --chat=CHAT_ID
 *   node scripts/repair-chat-message-sender-fields.mjs --rollback --backup=scripts/backups/....json
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const rollback = args.includes("--rollback");
const dryRun = !apply && !rollback;
const limitChats = Number(
  (args.find((a) => a.startsWith("--limit-chats=")) || "--limit-chats=0").slice(
    "--limit-chats=".length,
  ),
);
const chatIdFilter = (args.find((a) => a.startsWith("--chat=")) || "").slice("--chat=".length);
const backupArg = (args.find((a) => a.startsWith("--backup=")) || "").slice("--backup=".length);
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "sayittome-app";

function readFirebaseCliAccessToken() {
  const configPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const token = config?.tokens?.access_token;
  const expiresAt = Number(config?.tokens?.expires_at || 0);
  if (!token || expiresAt <= Date.now()) {
    throw new Error("Firebase CLI access token missing/expired. Run: firebase login");
  }
  return token;
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) {
    const fields = value.mapValue.fields || {};
    const out = {};
    for (const [k, v] of Object.entries(fields)) out[k] = decodeFirestoreValue(v);
    return out;
  }
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(decodeFirestoreValue);
  }
  return undefined;
}

function decodeDoc(doc) {
  const fields = doc.fields || {};
  const data = {};
  for (const [k, v] of Object.entries(fields)) data[k] = decodeFirestoreValue(v);
  const name = String(doc.name || "");
  return { id: name.split("/").pop(), name, data };
}

function planRepair(fromUid, data, chatTargetUid) {
  const from = String(fromUid || "").trim();
  const existingAuth = String(data.senderAuthUid || "").trim();
  const existingRole = String(data.senderRole || "").trim();
  const existingProfile = String(data.senderProfileId || "").trim();
  const target = String(chatTargetUid || "").trim();

  if (from === "profile_unknown" && target) {
    return {
      fromUid: `profile_${target}`,
      senderAuthUid: target,
      senderProfileId: target,
      senderRole: "profile",
    };
  }

  if (from.startsWith("profile_")) {
    const uid = from.slice("profile_".length);
    if (!uid || uid === "unknown") return null;
    if (existingAuth === uid && existingRole === "profile" && existingProfile === uid) {
      return null;
    }
    return {
      senderAuthUid: uid,
      senderProfileId: uid,
      senderRole: "profile",
    };
  }

  if (from.startsWith("anon_")) {
    if (existingRole === "anon" && !existingAuth && !existingProfile) return null;
    return {
      senderAuthUid: "",
      senderProfileId: "",
      senderRole: "anon",
    };
  }

  return null;
}

async function firestoreList(collectionPath, { pageToken, pageSize = 100 } = {}) {
  const token = readFirebaseCliAccessToken();
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collectionPath}`,
  );
  url.searchParams.set("pageSize", String(pageSize));
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`list ${collectionPath}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function firestoreGet(docPath) {
  const token = readFirebaseCliAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get ${docPath}: ${res.status} ${await res.text()}`);
  return decodeDoc(await res.json());
}

async function firestorePatch(docPath, patch) {
  const token = readFirebaseCliAccessToken();
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`,
  );
  const fields = {};
  for (const [key, value] of Object.entries(patch)) {
    url.searchParams.append("updateMask.fieldPaths", key);
    fields[key] =
      value === "" || value == null ? { nullValue: null } : { stringValue: String(value) };
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`patch ${docPath}: ${res.status} ${await res.text()}`);
}

function backupPath() {
  const dir = path.join(root, "scripts", "backups");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(
    dir,
    `chat-sender-fields-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
}

async function listAllChatIds() {
  if (chatIdFilter) return [chatIdFilter];
  const ids = [];
  let pageToken;
  do {
    const page = await firestoreList("chats", { pageToken, pageSize: 100 });
    for (const doc of page.documents || []) {
      ids.push(decodeDoc(doc).id);
      if (limitChats > 0 && ids.length >= limitChats) return ids;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

async function runRepair() {
  const metrics = {
    mode: dryRun ? "dry-run" : "apply",
    chatsScanned: 0,
    messagesScanned: 0,
    candidates: 0,
    updated: 0,
    skipped: 0,
    samples: [],
  };
  const backupRows = [];
  const chatIds = await listAllChatIds();

  for (const chatId of chatIds) {
    metrics.chatsScanned += 1;
    const chat = await firestoreGet(`chats/${chatId}`);
    const chatTarget = String(
      chat?.data?.targetUid || chat?.data?.receptorUid || chat?.data?.anonOwnerUid || "",
    ).trim();

    let pageToken;
    do {
      const page = await firestoreList(`chats/${chatId}/mensajes`, {
        pageToken,
        pageSize: 200,
      });
      for (const raw of page.documents || []) {
        metrics.messagesScanned += 1;
        const msg = decodeDoc(raw);
        const fromUid = String(
          msg.data.fromUid || msg.data.ownerId || msg.data.senderUid || "",
        ).trim();
        const next = planRepair(fromUid, msg.data, chatTarget);
        if (!next) {
          metrics.skipped += 1;
          continue;
        }
        metrics.candidates += 1;
        const sample = { chatId, messageId: msg.id, fromUid, next };
        if (metrics.samples.length < 40) metrics.samples.push(sample);
        backupRows.push({
          path: `chats/${chatId}/mensajes/${msg.id}`,
          before: {
            fromUid: msg.data.fromUid ?? null,
            senderAuthUid: msg.data.senderAuthUid ?? null,
            senderProfileId: msg.data.senderProfileId ?? null,
            senderRole: msg.data.senderRole ?? null,
          },
          after: next,
        });
        if (apply) {
          await firestorePatch(`chats/${chatId}/mensajes/${msg.id}`, {
            ...next,
            senderFieldsRepair: "sender-triple-v1",
          });
          metrics.updated += 1;
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  const backup = backupPath();
  fs.writeFileSync(backup, JSON.stringify({ createdAt: new Date().toISOString(), backupRows }, null, 2));
  console.log(JSON.stringify({ ...metrics, backup }, null, 2));
}

async function runRollback() {
  if (!backupArg) throw new Error("--backup= required");
  const payload = JSON.parse(fs.readFileSync(backupArg, "utf8"));
  let restored = 0;
  for (const row of payload.backupRows || []) {
    await firestorePatch(row.path, row.before);
    restored += 1;
  }
  console.log(JSON.stringify({ mode: "rollback", restored, backup: backupArg }, null, 2));
}

if (rollback) await runRollback();
else await runRepair();
