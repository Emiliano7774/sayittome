import { safeChatPart } from "@/lib/chat/anonChatId";

const STORAGE_KEY = "sayittome:viewer-identity:v1";

export type CachedViewerIdentity = {
  uid: string;
  username: string;
  usernameSlug: string;
};

function readRaw(): CachedViewerIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    const uid = String(parsed.uid || "").trim();
    const username = String(parsed.username || "").trim();
    if (!uid) return null;
    return {
      uid,
      username,
      usernameSlug: String(parsed.usernameSlug || safeChatPart(username) || "").trim(),
    };
  } catch {
    return null;
  }
}

export function readCachedViewerIdentity(expectedUid = ""): CachedViewerIdentity | null {
  const cached = readRaw();
  if (!cached) return null;
  if (expectedUid && cached.uid !== expectedUid) return null;
  return cached;
}

export function writeCachedViewerIdentity(uid: string, username: string) {
  const nextUid = String(uid || "").trim();
  const nextUsername = String(username || "").trim();
  if (typeof window === "undefined" || !nextUid) return;
  try {
    const payload: CachedViewerIdentity = {
      uid: nextUid,
      username: nextUsername,
      usernameSlug: safeChatPart(nextUsername),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota
  }
}

export function clearCachedViewerIdentity() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
