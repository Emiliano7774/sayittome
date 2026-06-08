const API_KEY = "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const PROJECT_ID = "sayittome-app";
const STATS_DOC = "stats/public";

export type PublicStats = {
  registeredUsersCount: number;
  anonymousOnlineCount: number;
  updatedAt: number;
};

let memoryCache: PublicStats | null = null;
let memoryCacheAt = 0;
const MEMORY_TTL_MS = 60_000;

function statsDocUrl() {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${STATS_DOC}?key=${API_KEY}`;
}

function intField(value: number) {
  return { integerValue: String(Math.max(0, Math.floor(value))) };
}

export async function readPublicStats(force = false): Promise<PublicStats | null> {
  const now = Date.now();
  if (!force && memoryCache && now - memoryCacheAt < MEMORY_TTL_MS) {
    return memoryCache;
  }

  try {
    const res = await fetch(statsDocUrl(), { cache: "no-store" });
    if (!res.ok) return memoryCache;

    const json = await res.json();
    const fields = json?.fields || {};

    const stats: PublicStats = {
      registeredUsersCount: Number(fields.registeredUsersCount?.integerValue || 0),
      anonymousOnlineCount: Number(fields.anonymousOnlineCount?.integerValue || 0),
      updatedAt: Date.parse(fields.updatedAt?.timestampValue || "") || 0,
    };

    memoryCache = stats;
    memoryCacheAt = now;
    return stats;
  } catch {
    return memoryCache;
  }
}

export async function writePublicStats(partial: Partial<PublicStats>) {
  const current = (await readPublicStats(true)) || {
    registeredUsersCount: 0,
    anonymousOnlineCount: 0,
    updatedAt: 0,
  };

  const next: PublicStats = {
    registeredUsersCount:
      partial.registeredUsersCount ?? current.registeredUsersCount,
    anonymousOnlineCount:
      partial.anonymousOnlineCount ?? current.anonymousOnlineCount,
    updatedAt: Date.now(),
  };

  memoryCache = next;
  memoryCacheAt = Date.now();

  try {
    await fetch(statsDocUrl(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          registeredUsersCount: intField(next.registeredUsersCount),
          anonymousOnlineCount: intField(next.anonymousOnlineCount),
          updatedAt: { timestampValue: new Date(next.updatedAt).toISOString() },
        },
      }),
    });
  } catch (e) {
    console.error("writePublicStats", e);
  }

  return next;
}
