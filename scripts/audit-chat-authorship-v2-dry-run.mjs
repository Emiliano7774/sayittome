/**
 * Second historical classification. Extra deterministic evidence only.
 * CERO writes. Refuses --apply. Invert without proof stays ambiguous.
 *
 * Extra evidence considered:
 * - createdByAuthUid / senderAuthUid already on the doc (future rows)
 * - first visitor message matching chatId anon (not invert)
 * - participantes + profile_ fromUid already consistent
 * Sequence / late targetUid / Aug 10 senderKind-only never prove invert.
 *
 * Usage: node scripts/audit-chat-authorship-v2-dry-run.mjs --limit-chats=80
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.includes("--apply") || args.includes("--rollback")) {
  console.error("REFUSED: v2 classifier is dry-run only. No historical writes.");
  process.exit(2);
}

const limitChats = Number(
  (args.find((a) => a.startsWith("--limit-chats=")) || "--limit-chats=80").slice(
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

function threadAnonFromChatId(chatId) {
  const id = String(chatId || "");
  const idx = id.indexOf(ANON_TO);
  if (idx <= 0) return "";
  const left = id.slice(0, idx);
  return left.startsWith("anon_") ? left : "";
}

function classifyV2(chat, message, index) {
  const from = String(message.data.fromUid || message.data.ownerId || "").trim();
  const shape = shapeOf(from);
  const senderRole = String(message.data.senderRole || "").trim();
  const senderAuth = String(message.data.senderAuthUid || "").trim();
  const createdBy = String(message.data.createdByAuthUid || "").trim();
  const threadAnon = threadAnonFromChatId(chat.id);
  const participantes = Array.isArray(chat.data.participantes)
    ? chat.data.participantes.map(String)
    : [];

  if (senderAuth && senderRole === "profile" && shape === "profile") {
    return { bucket: "already_canonical", reason: "sender_triple_profile" };
  }
  if (senderRole === "anon" && shape === "anon" && (!threadAnon || from === threadAnon)) {
    return { bucket: "already_canonical", reason: "sender_triple_anon" };
  }
  if (shape === "profile" && participantes.some((uid) => from === `profile_${uid}` || from === uid)) {
    return { bucket: "demonstrable_consistent", reason: "profile_from_matches_participant" };
  }
  if (index === 0 && threadAnon && from === threadAnon && !createdBy) {
    return { bucket: "demonstrable_visitor_first", reason: "first_matches_chatId_anon" };
  }

  // Invert is only demonstrable if write-time auth contradicts fromUid.
  if (createdBy && shape === "anon" && from.endsWith(createdBy.slice(-8)) === false) {
    const createdLooksProfile = participantes.includes(createdBy);
    if (createdLooksProfile && from === threadAnon) {
      return {
        bucket: "demonstrable_invert",
        reason: "createdByAuthUid_is_participant_but_from_is_thread_anon",
      };
    }
  }

  return { bucket: "ambiguous_invert", reason: "no_deterministic_author_proof" };
}

async function listCollection(token, parent, pageSize = 100) {
  const out = [];
  let pageToken = "";
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${parent}`,
    );
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`list ${parent} ${res.status}`);
    const json = await res.json();
    for (const doc of json.documents || []) out.push(decodeDoc(doc));
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return out;
}

const token = readFirebaseCliAccessToken();
const chats = chatIdFilter
  ? [
      decodeDoc(
        await (
          await fetch(
            `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/chats/${encodeURIComponent(chatIdFilter)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          )
        ).json(),
      ),
    ]
  : (await listCollection(token, "chats", 80)).slice(0, limitChats || 80);

const counts = {
  chats: chats.length,
  messages: 0,
  already_canonical: 0,
  demonstrable_consistent: 0,
  demonstrable_visitor_first: 0,
  demonstrable_invert: 0,
  ambiguous_invert: 0,
  writes: 0,
};

const samples = [];

for (const chat of chats) {
  if (!chat?.id) continue;
  let messages = [];
  try {
    messages = await listCollection(token, `chats/${chat.id}/mensajes`, 100);
  } catch {
    continue;
  }
  messages.sort((a, b) => String(a.data.createdAt || "").localeCompare(String(b.data.createdAt || "")));
  counts.messages += messages.length;
  messages.forEach((message, index) => {
    const classified = classifyV2(chat, message, index);
    counts[classified.bucket] += 1;
    if (samples.length < 12) {
      samples.push({
        chatSuffix: suffixOf(chat.id),
        messageSuffix: suffixOf(message.id),
        fromShape: shapeOf(message.data.fromUid),
        senderRole: String(message.data.senderRole || ""),
        createdByPresent: Boolean(message.data.createdByAuthUid),
        ...classified,
      });
    }
  });
}

const report = {
  gate: "AUTHORSHIP_V2_DRY_RUN",
  apply: false,
  writes: 0,
  limit: "Invert remains ambiguous without createdByAuthUid contradiction. No automatic repair.",
  assistedCapture: "qaDebug overlay + local authorship corrections (messageId + mine). No PII.",
  counts,
  samples,
};

const outPath = path.join(root, "scripts", "audit-chat-authorship-v2-last.json");
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
