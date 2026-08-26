/**
 * Read-only inventory for assisted historical repair. CERO writes.
 * Classifies chats by deterministic identity only. Never guesses message roles.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.includes("--apply")) {
  console.error("REFUSED: inventory is read-only. writes=0");
  process.exit(2);
}

const PROJECT = "sayittome-app";
const ANON_TO = "__anon_to__";
const limitChats = Number(
  (process.argv.find((a) => a.startsWith("--limit-chats=")) || "--limit-chats=200").slice(
    "--limit-chats=".length,
  ),
);

function readToken() {
  const configPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const token = config?.tokens?.access_token;
  const expiresAt = Number(config?.tokens?.expires_at || 0);
  if (!token || expiresAt <= Date.now()) throw new Error("firebase login expired");
  return token;
}

function decodeValue(value) {
  if (!value || typeof value !== "object") return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) out[k] = decodeValue(v);
    return out;
  }
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  return undefined;
}

function decodeDoc(doc) {
  const data = {};
  for (const [k, v] of Object.entries(doc.fields || {})) data[k] = decodeValue(v);
  return { id: String(doc.name || "").split("/").pop(), updateTime: doc.updateTime || "", data };
}

const {
  classifyInventoryConfidence,
  inventoryBucketOnly,
} = await import(
  pathToFileURL(path.join(root, "src/lib/chat/historicalRepairSafety.ts")).href
);

function usernameHint(chatId) {
  const id = String(chatId || "");
  const idx = id.indexOf(ANON_TO);
  if (idx < 0) return "";
  return id.slice(idx + ANON_TO.length);
}

function threadAnon(chatId) {
  const id = String(chatId || "");
  const idx = id.indexOf(ANON_TO);
  if (idx <= 0) return "";
  const left = id.slice(0, idx);
  return left.startsWith("anon_") ? left : "";
}

async function listCollection(token, parent, pageSize = 80) {
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
  } while (pageToken && out.length < 400);
  return out;
}

async function lookupUsername(token, slug) {
  if (!slug) return "";
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "usuarios" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "usernameLower" },
            op: "EQUAL",
            value: { stringValue: slug.toLowerCase() },
          },
        },
        limit: 1,
      },
    }),
  });
  if (!res.ok) return "";
  const json = await res.json();
  const doc = Array.isArray(json) ? json.find((row) => row.document)?.document : null;
  return doc ? String(doc.name || "").split("/").pop() : "";
}

function evaluateIdentity(chat, ownerFromUsername) {
  const chatId = chat.id;
  const anon = threadAnon(chatId);
  const lookedUp = String(ownerFromUsername || "").trim();
  const receptor = String(chat.data.receptorUid || chat.data.anonOwnerUid || "").trim();
  if (!chatId.includes(ANON_TO)) return { ok: false, error: "chat_not_profile_anon", source: "missing" };
  if (!anon.startsWith("anon_")) return { ok: false, error: "thread_anon_not_deterministic", source: "missing" };
  if (lookedUp && receptor && lookedUp !== receptor) {
    return { ok: false, error: "owner_identity_ambiguous", source: "ambiguous_mismatch" };
  }
  if (!lookedUp) {
    return { ok: false, error: "owner_identity_not_deterministic", source: receptor ? "chat_receptor" : "missing" };
  }
  return { ok: true, error: "", source: "username_lookup" };
}

const token = readToken();
const chats = (await listCollection(token, "chats", 80)).slice(0, limitChats);
const usernameCache = new Map();
const buckets = { high: 0, medium: 0, low: 0, ambiguous: 0 };
let messagesMissingRole = 0;
let messagesCanonical = 0;
let eligibleIdentity = 0;
let blockedIdentity = 0;
let needsHumanMarks = 0;
const eligibleNeedsMarks = [];
const blockedSamples = [];

for (const chat of chats) {
  const slug = usernameHint(chat.id);
  if (slug && !usernameCache.has(slug)) {
    usernameCache.set(slug, await lookupUsername(token, slug));
  }
  const identity = evaluateIdentity(chat, usernameCache.get(slug) || "");
  let messages = [];
  try {
    messages = await listCollection(token, `chats/${chat.id}/mensajes`, 80);
  } catch {
    messages = [];
  }
  const missingRole = messages.filter((row) => !String(row.data.senderRole || "").trim()).length;
  const canonical = messages.filter((row) => {
    const role = String(row.data.senderRole || "");
    return role === "profile" || role === "anon";
  }).length;
  messagesMissingRole += missingRole;
  messagesCanonical += canonical;

  const bucket = classifyInventoryConfidence({
    identityOk: identity.ok,
    ownerSource: identity.source,
    missingSenderRole: missingRole,
    alreadyCanonical: canonical,
    messageCount: messages.length,
  });
  buckets[bucket] += 1;

  const suffixIdx = String(chat.id || "").indexOf(ANON_TO);
  const chatSuffix =
    suffixIdx >= 0 ? String(chat.id).slice(suffixIdx + ANON_TO.length) : String(chat.id || "").slice(-24);

  if (!identity.ok) {
    blockedIdentity += 1;
    if (blockedSamples.length < 10) {
      blockedSamples.push({
        chatSuffix,
        identityOk: false,
        blockReason: identity.error || "identity_blocked",
        ownerSource: identity.source,
        messageCount: messages.length,
        missingSenderRole: missingRole,
      });
    }
  } else {
    eligibleIdentity += 1;
    if (missingRole > 0) {
      needsHumanMarks += 1;
      if (eligibleNeedsMarks.length < 40) {
        eligibleNeedsMarks.push({
          chatSuffix,
          slugPresent: Boolean(slug),
          identityOk: true,
          blockReason: "",
          ownerSource: identity.source,
          messageCount: messages.length,
          missingSenderRole: missingRole,
          alreadyCanonical: canonical,
          needsHumanMarks: true,
        });
      }
    }
  }
}

const report = {
  gate: "HISTORICAL_REPAIR_INVENTORY",
  apply: false,
  writes: 0,
  scannedChats: chats.length,
  eligibleIdentity,
  blockedIdentity,
  needsHumanMarks,
  messagesMissingRole,
  messagesCanonical,
  inventory: inventoryBucketOnly(buckets),
  note: "No message roles inferred. Eligible chats can be marked in /admin/authorship. Ambiguous chats stay blocked.",
  eligibleNeedsMarks,
  blockedSamples,
};

const outPath = path.join(root, "scripts", "inventory-historical-authorship-last.json");
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
