const STORAGE_KEY = "sayittome:thread-anon-ids:v2";
const ROOT_KEY = "sayittome:thread-anon-root:v2";

const memory = new Map<string, Map<string, Set<string>>>();

export type ThreadAnonContinuityScope = {
  authUid?: string;
  rootAnonSessionId?: string;
  ownerUncertain?: boolean;
  provenOwn?: boolean;
};

function asId(value: unknown) {
  return String(value || "").trim();
}

export function rootAnonContinuityId() {
  if (typeof window === "undefined") return "anon_server_root";
  try {
    const existing = window.localStorage.getItem(ROOT_KEY) || "";
    if (existing.startsWith("anon_")) return existing;
    const next = `anon_root_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(ROOT_KEY, next);
    return next;
  } catch {
    return "anon_server_root";
  }
}

export function continuityScopeKey(scope?: ThreadAnonContinuityScope) {
  const uid = asId(scope?.authUid);
  if (uid && !uid.startsWith("anon_")) return `uid:${uid}`;
  const anon = asId(scope?.rootAnonSessionId);
  if (anon.startsWith("anon_")) return `anon:${anon}`;
  return `anon:${rootAnonContinuityId()}`;
}

function scopeKeysToRead(scope?: ThreadAnonContinuityScope) {
  const keys: string[] = [];
  const uid = asId(scope?.authUid);
  if (uid && !uid.startsWith("anon_")) keys.push(`uid:${uid}`);
  const anon = asId(scope?.rootAnonSessionId);
  if (anon.startsWith("anon_")) keys.push(`anon:${anon}`);
  if (keys.length === 0) keys.push(`anon:${rootAnonContinuityId()}`);
  return keys;
}

function hydrate() {
  if (typeof window === "undefined" || memory.size > 0) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Record<string, string[]>>;
    for (const [scope, chats] of Object.entries(parsed || {})) {
      if (!scope || typeof chats !== "object" || !chats) continue;
      const chatMap = new Map<string, Set<string>>();
      for (const [chatId, ids] of Object.entries(chats)) {
        chatMap.set(
          chatId,
          new Set((ids || []).map(asId).filter((id) => id.startsWith("anon_"))),
        );
      }
      memory.set(scope, chatMap);
    }
  } catch {
    // ignore
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const payload: Record<string, Record<string, string[]>> = {};
    for (const [scope, chats] of memory.entries()) {
      const row: Record<string, string[]> = {};
      for (const [chatId, ids] of chats.entries()) {
        row[chatId] = [...ids];
      }
      payload[scope] = row;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota
  }
}

export function rememberThreadAnonId(
  chatId: string,
  anonId: string,
  scope?: ThreadAnonContinuityScope,
) {
  const thread = asId(chatId);
  const id = asId(anonId);
  if (!thread || !id.startsWith("anon_")) return listThreadAnonIds(thread, [], scope);
  if (scope?.ownerUncertain) return listThreadAnonIds(thread, [], scope);
  if (scope?.provenOwn !== true) return listThreadAnonIds(thread, [], scope);
  const key = continuityScopeKey(scope);
  if (!key) return listThreadAnonIds(thread, [], scope);
  hydrate();
  const chats = memory.get(key) || new Map<string, Set<string>>();
  const set = chats.get(thread) || new Set<string>();
  if (!set.has(id)) {
    set.add(id);
    chats.set(thread, set);
    memory.set(key, chats);
    persist();
  } else {
    chats.set(thread, set);
    memory.set(key, chats);
  }
  return [...set];
}

export function rememberOwnThreadAnonId(
  chatId: string,
  anonId: string,
  scope: ThreadAnonContinuityScope,
) {
  return rememberThreadAnonId(chatId, anonId, { ...scope, provenOwn: true });
}

export function listThreadAnonIds(
  chatId: string,
  extras: string[] = [],
  scope?: ThreadAnonContinuityScope,
) {
  hydrate();
  const thread = asId(chatId);
  const set = new Set<string>();
  for (const key of scopeKeysToRead(scope)) {
    const ids = memory.get(key)?.get(thread);
    if (!ids) continue;
    for (const id of ids) set.add(id);
  }
  for (const extra of extras) {
    const id = asId(extra);
    if (id.startsWith("anon_")) set.add(id);
  }
  return [...set];
}

export function clearThreadAnonContinuity(scope?: ThreadAnonContinuityScope) {
  hydrate();
  if (!scope) {
    memory.clear();
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(ROOT_KEY);
      } catch {
        // ignore
      }
    }
    persist();
    return;
  }
  for (const key of scopeKeysToRead(scope)) {
    memory.delete(key);
  }
  persist();
}

export function resetThreadAnonContinuityForTests() {
  memory.clear();
}

export function visitorOwnsAnonId(from: string, knownIds: string[]) {
  const author = asId(from);
  return author.startsWith("anon_") && knownIds.includes(author);
}
