/**
 * FASE 2 — READ ONLY authorship audit. ZERO Firestore writes.
 *
 * Classifies each message as metadata_fill / confident / ambiguous.
 * Ambiguous includes possible owner-written visitor fromUid (the invert).
 * Never proposes automatic fromUid rewrites for ambiguous rows.
 *
 * Usage:
 *   node scripts/audit-chat-authorship-dry-run.mjs --limit-chats=50
 *   node scripts/audit-chat-authorship-dry-run.mjs --chat=CHAT_ID
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.includes("--apply") || args.includes("--rollback")) {
  console.error("REFUSED: this script is dry-run only. No --apply/--rollback.");
  process.exit(2);
}

const limitChats = Number(
  (args.find((a) => a.startsWith("--limit-chats=")) || "--limit-chats=0").slice(
    "--limit-chats=".length,
  ),
);
const chatIdFilter = (args.find((a) => a.startsWith("--chat=")) || "").slice("--chat=".length);
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "sayittome-app";
const ANON_TO = "__anon_to__";

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

function shapeOf(fromUid) {
  const from = String(fromUid || "").trim();
  if (!from) return "empty";
  if (from.startsWith("profile_")) return "profile";
  if (from.startsWith("anon_")) return "anon";
  if (from.length >= 20 && !from.includes("_")) return "uid";
  return "other";
}

function suffixOf(value) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(-8) : "";
}

function redactChatId(chatId) {
  const id = String(chatId || "");
  if (!id.includes(ANON_TO)) return id ? `legacy:${suffixOf(id)}` : "";
  const visitor = id.split(ANON_TO)[0] || "";
  return `${visitor.startsWith("anon_") ? `anon_${suffixOf(visitor)}` : `id_${suffixOf(visitor)}`}__anon_to__<redacted>`;
}

function classifyMessage(chat, msg) {
  const from = String(msg.data.fromUid || msg.data.ownerId || msg.data.senderUid || "").trim();
  const senderKind = String(msg.data.senderKind || "").trim();
  const senderRole = String(msg.data.senderRole || "").trim();
  const senderAuth = String(msg.data.senderAuthUid || "").trim();
  const senderProfile = String(msg.data.senderProfileId || "").trim();
  const targetUid = String(
    chat.targetUid || chat.receptorUid || chat.anonOwnerUid || "",
  ).trim();
  const chatId = String(chat.id || "");
  const threadAnon = chatId.includes(ANON_TO) ? chatId.split(ANON_TO)[0] : "";
  const shape = shapeOf(from);
  const hasTriple = Boolean(senderRole && (senderAuth || senderRole === "anon"));

  const base = {
    chatIdRedacted: redactChatId(chatId),
    messageId: msg.id,
    path: `chats/${redactChatId(chatId)}/mensajes/${msg.id}`,
    fromShape: shape,
    fromUidSuffix: suffixOf(from),
    senderKind: senderKind || null,
    senderRole: senderRole || null,
    senderAuthPresent: Boolean(senderAuth),
    senderProfilePresent: Boolean(senderProfile),
  };

  if (!from) {
    return {
      bucket: "ambiguous",
      reason: "missing_fromUid",
      proposed: null,
      ...base,
    };
  }

  if (from === "profile_unknown") {
    return {
      bucket: "ambiguous",
      reason: "profile_unknown_cannot_infer_author",
      proposed: targetUid
        ? { note: "human_review_only", maybeFromUid: `profile_<target>` }
        : null,
      ...base,
    };
  }

  if (shape === "profile") {
    const uid = from.slice("profile_".length);
    if (targetUid && uid === targetUid) {
      if (hasTriple && senderRole === "profile" && senderAuth === uid) {
        return { bucket: "examined_ok", reason: "owner_profile_shape_complete", proposed: null, ...base };
      }
      return {
        bucket: "confident",
        reason: "owner_profile_shape_missing_sender_triple",
        proposed: {
          action: "metadata_fill_only",
          senderAuthUid: "<targetUid>",
          senderProfileId: "<targetUid>",
          senderRole: "profile",
          senderKind: senderKind && senderKind !== "profile" ? "profile" : senderKind || "profile",
          fromUid: "UNCHANGED",
        },
        ...base,
      };
    }
    return {
      bucket: "ambiguous",
      reason: "profile_shape_uid_ne_chat_target",
      proposed: null,
      ...base,
    };
  }

  if (shape === "anon") {
    const matchesThread = Boolean(threadAnon && from === threadAnon);
    if (senderKind === "profile" || senderRole === "profile") {
      return {
        bucket: "ambiguous",
        reason: "anon_fromUid_with_profile_role_possible_corrupt_write",
        proposed: null,
        ...base,
      };
    }
    if (matchesThread) {
      // Could be a real visitor OR an owner write during identity gap.
      return {
        bucket: "ambiguous",
        reason: "anon_matches_thread_visitor_or_owner_corrupt_write",
        proposed: hasTriple
          ? null
          : {
              action: "metadata_fill_only_if_human_confirms_visitor",
              senderRole: "anon",
              fromUid: "UNCHANGED",
            },
        ...base,
      };
    }
    return {
      bucket: "ambiguous",
      reason: "anon_fromUid_not_chatId_visitor",
      proposed: null,
      ...base,
    };
  }

  if (shape === "uid") {
    if (targetUid && from === targetUid) {
      return {
        bucket: "confident",
        reason: "legacy_raw_uid_equals_chat_target_owner",
        proposed: {
          action: "metadata_fill_only",
          senderAuthUid: "<targetUid>",
          senderProfileId: "<targetUid>",
          senderRole: "profile",
          fromUid: "UNCHANGED",
        },
        ...base,
      };
    }
    return {
      bucket: "ambiguous",
      reason: "legacy_raw_uid_not_equal_chat_target",
      proposed: null,
      ...base,
    };
  }

  return {
    bucket: "ambiguous",
    reason: "unrecognized_fromUid_shape",
    proposed: null,
    ...base,
  };
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

const metrics = {
  mode: "dry-run",
  writes: 0,
  chatsExamined: 0,
  messagesExamined: 0,
  examined_ok: 0,
  candidates: 0,
  confident: 0,
  ambiguous: 0,
  reasons: {},
  confidentSamples: [],
  ambiguousSamples: [],
};

const chatIds = await listAllChatIds();
for (const chatId of chatIds) {
  metrics.chatsExamined += 1;
  const chatDoc = await firestoreGet(`chats/${chatId}`);
  const chat = { id: chatId, ...(chatDoc?.data || {}) };
  let pageToken;
  do {
    const page = await firestoreList(`chats/${chatId}/mensajes`, {
      pageToken,
      pageSize: 200,
    });
    for (const raw of page.documents || []) {
      metrics.messagesExamined += 1;
      const classified = classifyMessage(chat, decodeDoc(raw));
      metrics.reasons[classified.reason] = (metrics.reasons[classified.reason] || 0) + 1;
      if (classified.bucket === "examined_ok") {
        metrics.examined_ok += 1;
        continue;
      }
      metrics.candidates += 1;
      if (classified.bucket === "confident") {
        metrics.confident += 1;
        if (metrics.confidentSamples.length < 30) metrics.confidentSamples.push(classified);
      } else {
        metrics.ambiguous += 1;
        if (metrics.ambiguousSamples.length < 40) metrics.ambiguousSamples.push(classified);
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
}

const outPath = path.join(
  root,
  "scripts",
  "backups",
  `authorship-dry-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ createdAt: new Date().toISOString(), ...metrics }, null, 2));

console.log(
  JSON.stringify(
    {
      ...metrics,
      report: outPath,
      note: "ZERO writes. Ambiguous must not be auto-applied. Checkpoint required.",
    },
    null,
    2,
  ),
);
