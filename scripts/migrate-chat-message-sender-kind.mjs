/**
 * Idempotent repair for chats/{chatId}/mensajes where senderKind contradicts fromUid.
 *
 * Never flips view-relative `mine` (client-only). Never invents authors.
 * Only normalizes senderKind to match durable fromUid shape:
 *   - fromUid starts with anon_  → senderKind = "anon"
 *   - fromUid starts with profile_ → senderKind = "profile"
 *
 * Auth preference:
 *   1) GOOGLE_APPLICATION_CREDENTIALS / ADC via firebase-admin
 *   2) Firebase CLI OAuth token (firestore REST)
 *
 * Usage:
 *   node scripts/migrate-chat-message-sender-kind.mjs --dry-run --limit-chats=50
 *   node scripts/migrate-chat-message-sender-kind.mjs --apply --limit-chats=20
 *   node scripts/migrate-chat-message-sender-kind.mjs --rollback --backup=scripts/backups/....json
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply && !args.includes("--rollback");
const rollback = args.includes("--rollback");
const limitChats = Number(
  (args.find((a) => a.startsWith("--limit-chats=")) || "--limit-chats=0").slice(
    "--limit-chats=".length,
  ),
);
const chatIdFilter = (args.find((a) => a.startsWith("--chat=")) || "").slice("--chat=".length);
const backupArg = (args.find((a) => a.startsWith("--backup=")) || "").slice("--backup=".length);
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "sayittome-app";

function resolveCanonicalSenderKind(fromUid, currentKind) {
  const from = String(fromUid || "").trim();
  const kind = String(currentKind || "").trim();
  if (from.startsWith("anon_")) return kind === "anon" ? null : "anon";
  if (from.startsWith("profile_")) return kind === "profile" ? null : "profile";
  return null;
}

function backupPath() {
  const dir = path.join(root, "scripts", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(dir, `chat-sender-kind-${stamp}.json`);
}

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
  const id = name.split("/").pop();
  return { id, name, data };
}

async function firestoreList(collectionPath, { pageToken, pageSize = 100 } = {}) {
  const token = readFirebaseCliAccessToken();
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collectionPath}`,
  );
  url.searchParams.set("pageSize", String(pageSize));
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Firestore list ${collectionPath}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function firestorePatchSenderKind(docPath, senderKind) {
  const token = readFirebaseCliAccessToken();
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`,
  );
  url.searchParams.set("updateMask.fieldPaths", "senderKind");
  url.searchParams.append("updateMask.fieldPaths", "senderKindRepairedAt");
  url.searchParams.append("updateMask.fieldPaths", "senderKindRepair");

  const now = new Date().toISOString();
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        senderKind: { stringValue: senderKind },
        senderKindRepairedAt: { timestampValue: now },
        senderKindRepair: { stringValue: "fromUid-shape-v1" },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Firestore patch ${docPath}: ${res.status} ${await res.text()}`);
  }
}

async function firestoreRollbackSenderKind(docPath, previousKind) {
  const token = readFirebaseCliAccessToken();
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`,
  );
  url.searchParams.set("updateMask.fieldPaths", "senderKind");
  url.searchParams.append("updateMask.fieldPaths", "senderKindRollbackAt");

  const fields = {
    senderKindRollbackAt: { timestampValue: new Date().toISOString() },
  };
  if (previousKind == null) {
    fields.senderKind = { nullValue: null };
  } else {
    fields.senderKind = { stringValue: String(previousKind) };
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(`Firestore rollback ${docPath}: ${res.status} ${await res.text()}`);
  }
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

async function listMessages(chatId) {
  const out = [];
  let pageToken;
  do {
    const page = await firestoreList(`chats/${chatId}/mensajes`, {
      pageToken,
      pageSize: 200,
    });
    for (const doc of page.documents || []) out.push(decodeDoc(doc));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

async function runMigrate() {
  const metrics = {
    mode: dryRun ? "dry-run" : "apply",
    project: PROJECT,
    chatsScanned: 0,
    messagesScanned: 0,
    mismatches: 0,
    wouldUpdate: 0,
    updated: 0,
    skippedAmbiguous: 0,
    samples: [],
  };
  const backupRows = [];
  const chatIds = await listAllChatIds();

  for (const chatId of chatIds) {
    metrics.chatsScanned += 1;
    const messages = await listMessages(chatId);
    for (const msg of messages) {
      metrics.messagesScanned += 1;
      const data = msg.data || {};
      const fromUid = String(data.fromUid || data.ownerId || data.senderUid || "").trim();
      const currentKind = data.senderKind;
      const nextKind = resolveCanonicalSenderKind(fromUid, currentKind);
      if (!fromUid) {
        metrics.skippedAmbiguous += 1;
        continue;
      }
      if (!nextKind) continue;

      metrics.mismatches += 1;
      metrics.wouldUpdate += 1;
      const sample = {
        chatId,
        messageId: msg.id,
        fromUid,
        before: currentKind ?? null,
        after: nextKind,
      };
      if (metrics.samples.length < 40) metrics.samples.push(sample);
      const docPath = `chats/${chatId}/mensajes/${msg.id}`;
      backupRows.push({
        ...sample,
        path: docPath,
        previous: { senderKind: currentKind ?? null },
      });

      if (!dryRun) {
        await firestorePatchSenderKind(docPath, nextKind);
        metrics.updated += 1;
      }
    }
  }

  const outBackup = backupPath();
  fs.writeFileSync(
    outBackup,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        project: PROJECT,
        mode: metrics.mode,
        rows: backupRows,
      },
      null,
      2,
    ),
  );
  metrics.backup = outBackup;
  console.log(JSON.stringify(metrics, null, 2));
}

async function runRollback() {
  if (!backupArg) throw new Error("Pass --backup=...");
  const abs = path.isAbsolute(backupArg) ? backupArg : path.join(root, backupArg);
  const payload = JSON.parse(fs.readFileSync(abs, "utf8"));
  let restored = 0;
  for (const row of payload.rows || []) {
    await firestoreRollbackSenderKind(row.path, row.previous?.senderKind ?? null);
    restored += 1;
  }
  console.log(JSON.stringify({ mode: "rollback", restored, backup: abs }, null, 2));
}

async function main() {
  if (rollback) {
    await runRollback();
    return;
  }
  await runMigrate();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
