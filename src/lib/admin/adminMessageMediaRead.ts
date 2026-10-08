import {
  exactMessageCollectionName,
  moderationMessagePath,
  type ModerationMessageCollection,
} from "@/lib/moderation/moderationMessageCollections";

const VIEW_ONCE_SECRETS_COLLECTION = "viewOnceSecrets";
const STORAGE_BUCKET = "sayittome-app.firebasestorage.app";
const CHAT_ROOTS = ["chats", "chats_anonimos"] as const;
const CHAT_STORAGE_ROOTS = ["chats", "chat_media", "chats_anonimos"] as const;

type AdminMediaSource = "message" | "view_once_secret" | "storage_recovery";

function asText(value: unknown) {
  return String(value || "").trim();
}

function viewOnceSecretDocId(chatId: string, messageId: string) {
  return `${asText(chatId)}_${asText(messageId)}`;
}

export function normalizeAdminMessageMediaType(value: unknown) {
  const type = asText(value).toLowerCase();
  if (type === "photo" || type === "foto") return "image";
  if (type === "voice" || type === "voz") return "audio";
  return type || "text";
}
export function isAdminChatMediaType(value: unknown) {
  const type = normalizeAdminMessageMediaType(value);
  return type === "image" || type === "video" || type === "audio";
}

function isAllowedChatStoragePath(path: string) {
  const clean = asText(path).replace(/^\/+/, "");
  return CHAT_STORAGE_ROOTS.some((root) => clean.startsWith(`${root}/`));
}

export function storagePathFromAdminMediaUrl(raw: unknown) {
  const value = asText(raw);
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = /^\/v0\/b\/[^/]+\/o\/(.+)$/.exec(url.pathname);
      if (!match?.[1]) return "";
      const decoded = decodeURIComponent(match[1]);
      return isAllowedChatStoragePath(decoded) ? decoded : "";
    }
    if (url.hostname === "storage.googleapis.com") {
      const parts = decodeURIComponent(url.pathname).replace(/^\/+/, "").split("/");
      if (parts[0] === STORAGE_BUCKET) parts.shift();
      const decoded = parts.join("/");
      return isAllowedChatStoragePath(decoded) ? decoded : "";
    }
  } catch {
    return "";
  }
  return "";
}
function directMediaUrl(message: Record<string, unknown>) {
  const fields = [
    message.mediaUrl,
    message.imageUrl,
    message.photoUrl,
    message.videoUrl,
    message.audioUrl,
    message.fileUrl,
    message.url,
  ];
  for (const value of fields) {
    const clean = asText(value);
    if (clean) return clean;
  }
  return "";
}

export function adminMediaCandidatePrefixes(input: {
  chatId: string;
  messageId: string;
  clientId?: unknown;
}) {
  const chatId = asText(input.chatId);
  const ids = [...new Set([asText(input.clientId), asText(input.messageId)].filter(Boolean))];
  const prefixes: string[] = [];
  for (const root of CHAT_STORAGE_ROOTS) {
    for (const id of ids) prefixes.push(`${root}/${chatId}/${id}`);
  }
  return prefixes;
}

function looksLikeCandidateObject(name: string, prefix: string) {
  if (!name.startsWith(prefix)) return false;
  const suffix = name.slice(prefix.length);
  return suffix === "" || suffix.startsWith("_") || suffix.startsWith(".") || suffix.startsWith("-");
}

export function scoreAdminMediaCandidate(input: {
  name: string;
  size: number;
  contentType?: string;
  logicalType?: string;
}) {
  if (!Number.isFinite(input.size) || input.size <= 0) return -1;
  const logical = normalizeAdminMessageMediaType(input.logicalType);
  const contentType = asText(input.contentType).toLowerCase();
  const name = asText(input.name).toLowerCase();
  let score = 1;
  if (logical && contentType.startsWith(`${logical}/`)) score += 1000;
  const extensionMatches =
    logical === "video"
      ? /\.(mp4|webm|mov|m4v|3gp|mkv|avi)$/i.test(name)
      : logical === "audio"
        ? /\.(m4a|mp3|wav|ogg|opus|aac|webm)$/i.test(name)
        : logical === "image"
          ? /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(name)
          : false;
  if (extensionMatches) score += 500;
  score += Math.min(400, Math.floor(Math.log10(Math.max(1, input.size)) * 50));
  return score;
}
async function adminStorageBucket() {
  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const { loadFirebaseAdminStorage } = await import("@/lib/admin/firebaseAdminNative");
  getRepairAdminDb();
  const { getStorage } = loadFirebaseAdminStorage();
  return getStorage().bucket(STORAGE_BUCKET);
}

async function storagePathHasBytes(path: string) {
  if (!path || !isAllowedChatStoragePath(path)) return false;
  try {
    const bucket = await adminStorageBucket();
    const [metadata] = await bucket.file(path).getMetadata();
    return Number(metadata.size || 0) > 0;
  } catch {
    return false;
  }
}

async function recoverStoragePath(input: {
  chatId: string;
  messageId: string;
  message: Record<string, unknown>;
  logicalType?: string;
}) {
  const directPath = asText(
    input.message.storagePath ||
      input.message.mediaStoragePath ||
      input.message.filePath ||
      input.message.objectPath,
  );
  if (directPath && isAllowedChatStoragePath(directPath) && (await storagePathHasBytes(directPath))) {
    return directPath;
  }

  const bucket = await adminStorageBucket();
  let best: { name: string; score: number; size: number } | null = null;
  for (const prefix of adminMediaCandidatePrefixes({
    chatId: input.chatId,
    messageId: input.messageId,
    clientId: input.message.clientId,
  })) {
    const [files] = await bucket.getFiles({ prefix, maxResults: 24, autoPaginate: false });
    for (const file of files.filter((item) => looksLikeCandidateObject(item.name, prefix))) {
      try {
        const [metadata] = await file.getMetadata();
        const size = Number(metadata.size || 0);
        const score = scoreAdminMediaCandidate({
          name: file.name,
          size,
          contentType: asText(metadata.contentType),
          logicalType: input.logicalType,
        });
        if (score < 0) continue;
        if (!best || score > best.score || (score === best.score && size > best.size)) {
          best = { name: file.name, score, size };
        }
      } catch {
        // Ignore broken metadata entries and keep scanning candidates.
      }
    }
  }
  return best?.name && isAllowedChatStoragePath(best.name) ? best.name : "";
}

export type AdminMessageMediaReadResult =
  | {
      ok: true;
      mediaUrl: string;
      storagePath: string;
      source: AdminMediaSource;
      type: string;
      viewOnce: boolean;
      viewOnceLimit?: number;
      viewOnceOpenedCount?: number;
      viewOnceExhausted?: boolean;
      readOnly: true;
    }
  | { ok: false; error: string; status: number };

async function findMessage(input: {
  db: ReturnType<Awaited<typeof import("@/lib/chat/historicalAuthorshipRepairAdmin")>["getRepairAdminDb"]>;
  chatId: string;
  messageId: string;
  collectionName: ModerationMessageCollection;
}) {
  for (const chatRoot of CHAT_ROOTS) {
    const ref = input.db
      .collection(chatRoot)
      .doc(input.chatId)
      .collection(input.collectionName)
      .doc(input.messageId);
    const snap = await ref.get();
    if (snap.exists) return { snap, chatRoot };
  }
  return null;
}
/** Admin read-only media lookup. Never consumes view-once counters or grants. */
export async function readAdminMessageMedia(input: {
  chatId: string;
  messageId: string;
  collectionName: ModerationMessageCollection;
}): Promise<AdminMessageMediaReadResult> {
  const chatId = asText(input.chatId);
  const messageId = asText(input.messageId);
  const collectionName = exactMessageCollectionName(input.collectionName);
  if (!chatId || !messageId || !collectionName) {
    return { ok: false, error: "missing_fields", status: 400 };
  }

  const { getRepairAdminDb } = await import("@/lib/chat/historicalAuthorshipRepairAdmin");
  const db = getRepairAdminDb();
  const located = await findMessage({ db, chatId, messageId, collectionName });
  if (!located) return { ok: false, error: "message_not_found", status: 404 };

  const message = (located.snap.data() || {}) as Record<string, unknown>;
  const type = normalizeAdminMessageMediaType(message.type);
  const viewOnce = message.viewOnce === true;
  let mediaUrl = directMediaUrl(message);
  let storagePath = storagePathFromAdminMediaUrl(mediaUrl);
  let source: AdminMediaSource = "message";

  if (viewOnce) {
    const secretSnap = await db
      .collection(VIEW_ONCE_SECRETS_COLLECTION)
      .doc(viewOnceSecretDocId(chatId, messageId))
      .get();
    const secret = (secretSnap.data() || {}) as Record<string, unknown>;
    const secretUrl = asText(secret.mediaUrl);
    const secretPath = asText(secret.storagePath);
    if (secretUrl || (secretPath && isAllowedChatStoragePath(secretPath))) {
      mediaUrl = secretUrl;
      storagePath = secretPath || storagePathFromAdminMediaUrl(secretUrl);
      source = "view_once_secret";
    }
  }
  const needsRecovery = isAdminChatMediaType(type) || viewOnce;
  const storagePathUsable = storagePath ? await storagePathHasBytes(storagePath) : false;
  if (needsRecovery && ((!mediaUrl && !storagePath) || (storagePath && !storagePathUsable))) {
    try {
      const recovered = await recoverStoragePath({
        chatId,
        messageId,
        message,
        logicalType: type,
      });
      if (recovered) {
        storagePath = recovered;
        mediaUrl = "";
        source = "storage_recovery";
      } else if (storagePath && !storagePathUsable) {
        storagePath = "";
        mediaUrl = "";
      }
    } catch {
      if (storagePath && !storagePathUsable) {
        storagePath = "";
        mediaUrl = "";
      }
    }
  }

  if (!mediaUrl && !storagePath) {
    return {
      ok: false,
      error: isAdminChatMediaType(type) || viewOnce ? "media_unavailable" : "no_media",
      status: 404,
    };
  }

  return {
    ok: true,
    mediaUrl,
    storagePath,
    source,
    type,
    viewOnce,
    viewOnceLimit: Number(message.viewOnceLimit) || undefined,
    viewOnceOpenedCount: Number(message.viewOnceOpenedCount) || undefined,
    viewOnceExhausted: message.viewOnceExhausted === true,
    readOnly: true,
  };
}

function asciiBytes(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function hasBytes(bytes: Uint8Array, values: number[], offset = 0) {
  return values.every((value, index) => bytes[offset + index] === value);
}

export function sniffAdminMediaContentType(
  bytes: Uint8Array,
  declaredType: unknown,
  logicalType?: unknown,
) {
  const declared = asText(declaredType).split(";", 1)[0].toLowerCase();
  const logical = normalizeAdminMessageMediaType(logicalType);

  if (hasBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return logical === "audio" ? "audio/webm" : "video/webm";
  }
  if (asciiBytes(bytes, 0, 4) === "OggS") {
    return logical === "audio" ? "audio/ogg" : "video/ogg";
  }
  if (asciiBytes(bytes, 0, 4) === "RIFF" && asciiBytes(bytes, 8, 4) === "WAVE") return "audio/wav";
  if (asciiBytes(bytes, 0, 4) === "RIFF" && asciiBytes(bytes, 8, 4) === "AVI ") return "video/x-msvideo";
  if (asciiBytes(bytes, 4, 4) === "ftyp") {
    const brand = asciiBytes(bytes, 8, 4).toLowerCase();
    if (brand.startsWith("3gp")) return logical === "audio" ? "audio/3gpp" : "video/3gpp";
    return logical === "audio" ? "audio/mp4" : "video/mp4";
  }
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (asciiBytes(bytes, 0, 6) === "GIF87a" || asciiBytes(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (asciiBytes(bytes, 0, 4) === "RIFF" && asciiBytes(bytes, 8, 4) === "WEBP") return "image/webp";
  if (asciiBytes(bytes, 0, 3) === "ID3") return "audio/mpeg";
  if (declared && declared !== "application/octet-stream") return declared;
  if (logical === "video") return "video/mp4";
  if (logical === "audio") return "audio/mpeg";
  if (logical === "image") return "image/jpeg";
  return declared || "application/octet-stream";
}

export type AdminMessageMediaBytesResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; error: string; status: number };
export async function readAdminMessageMediaBytes(
  source: Extract<AdminMessageMediaReadResult, { ok: true }>,
): Promise<AdminMessageMediaBytesResult> {
  try {
    if (source.storagePath) {
      const bucket = await adminStorageBucket();
      const file = bucket.file(source.storagePath);
      const [[buffer], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
      const bytes = Uint8Array.from(buffer);
      return {
        ok: true,
        bytes,
        contentType: sniffAdminMediaContentType(bytes, metadata.contentType, source.type),
      };
    }

    if (source.mediaUrl) {
      const response = await fetch(source.mediaUrl, { cache: "no-store", redirect: "error" });
      if (!response.ok) {
        return { ok: false, error: "media_fetch_failed", status: 502 };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        ok: true,
        bytes,
        contentType: sniffAdminMediaContentType(bytes, response.headers.get("content-type"), source.type),
      };
    }
  } catch {
    return { ok: false, error: "media_fetch_failed", status: 502 };
  }

  return { ok: false, error: "media_unavailable", status: 404 };
}

export { moderationMessagePath };
