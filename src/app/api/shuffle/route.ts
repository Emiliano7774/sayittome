import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

import { getActiveBoostProfiles } from "@/lib/boost/service";
import { BOOST_TOP_SLOTS } from "@/lib/boost/constants";
import { readPublicStats, writePublicStats } from "@/lib/firestore/publicStats";
import { isShuffleProfileOnline, ONLINE_WINDOW_MS } from "@/lib/presence";
import { parseFirestoreDoc, runCollectionQueryAll } from "@/lib/firestore/rest";
import { isLastSeenPublic, stripPublicPresence } from "@/lib/profile/lastSeenVisibility";
import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import { resolveProfileCountryCode } from "@/lib/geo/countries";
import { normalizeUsername } from "@/lib/profile/username";
import {
  SHUFFLE_DEDUPE_VERSION,
  dedupeShuffleProfiles,
  resolveUsernameLower,
  shuffleProfileDedupeKeys,
  uniqueShuffleWindow,
} from "@/lib/shuffle/dedupeProfiles";
import { shuffleProfileMatchesBoostUid } from "@/lib/shuffle/shuffleActionTargets";
import {
  collapseRowsByOwner,
  forceShuffleVisitorOnline,
  sanitizeShuffleVisitorChatId,
} from "@/lib/shuffle/shuffleVisitorId";
import {
  parseShuffleFiltersFromSearchParams,
  parseViewerGeoTarget,
  profileIsVisibleToViewer,
  profileMatchesShuffleServerFilters,
} from "@/lib/shuffle/serverFilters";
import { ANON_SHUFFLE_VISIBILITY_MS, anonShuffleVisible } from "@/lib/anonMatch/anonymousPresenceIdentity";

const SHUFFLE_JSON_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  "x-shuffle-dedupe-version": String(SHUFFLE_DEDUPE_VERSION),
};

function shuffleJson(
  req: Request,
  body: Record<string, unknown>,
  init?: { status?: number; publicVisitorSlice?: boolean },
) {
  const json = JSON.stringify(body);
  const acceptEncoding = String(req.headers.get("accept-encoding") || "").toLowerCase();
  const headers = new Headers(SHUFFLE_JSON_HEADERS);
  headers.set("Content-Type", "application/json; charset=utf-8");
  // This endpoint returns the same public visitor slice to every caller.
  // The server already reuses it for 20s, so let Firebase Hosting's shared
  // cache coalesce simultaneous clients without changing live-match rules.
  if (init?.publicVisitorSlice) {
    headers.set("Cache-Control", "public, max-age=0, s-maxage=20");
    headers.delete("Pragma");
  }

  // Firebase's dynamic SSR path does not currently compress this payload for us.
  // The full pool is hundreds of KB, so explicit compression dramatically cuts
  // cold-start transfer while leaving the response semantics untouched.
  if (json.length >= 32_768) {
    headers.set("Vary", "Accept-Encoding");
    if (acceptEncoding.includes("br")) {
      const compressed = brotliCompressSync(Buffer.from(json), {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
        },
      });
      headers.set("Content-Encoding", "br");
      return new Response(compressed, { status: init?.status, headers });
    }
    if (acceptEncoding.includes("gzip")) {
      const compressed = gzipSync(Buffer.from(json), { level: 6 });
      headers.set("Content-Encoding", "gzip");
      return new Response(compressed, { status: init?.status, headers });
    }
  }

  return new Response(json, { status: init?.status, headers });
}

export const dynamic = "force-dynamic";

const API_KEY = "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const PROJECT_ID = "sayittome-app";

const PROFILE_CACHE_MS = 10 * 60_000;
const ANON_CACHE_MS = 5 * 60_000;
const STATS_REFRESH_MS = 15 * 60_000;
/** Max profiles returned in one API response (client holds the full shuffle pool). */
const SHUFFLE_RESPONSE_LIMIT = 10_000;
/** Max profiles considered when searching by username text. */
const SHUFFLE_SEARCH_LIMIT = 200;
const SHUFFLE_FETCH_PAGE_SIZE = 1000;
const SHUFFLE_FETCH_MAX_PAGES = 40;
const ANON_SCAN_LIMIT = 1000;
/** Live anonymous sessions are a separate, short-lived slice of the pool. */
const VISITOR_SCAN_LIMIT = 1000;
const VISITOR_CACHE_MS = 20_000;

type ApiProfile = {
  uid: string;
  authUid?: string;
  firebaseUid?: string;
  profileUid?: string;
  ownerUid?: string;
  aliasIds?: string[];
  username: string;
  usernameLower?: string;
  usernameAliases?: string[];
  email?: string;
  bio: string;
  photo: string;
  coverPhoto?: string;
  coverVideo?: string;
  lastActive?: string;
  presenceAt?: string;
  online?: boolean;
  showOnline?: boolean;
  mostrarUltimaVez?: boolean;
  provincia?: string;
  ciudad?: string;
  pais?: string;
  visibilidadPaises?: string[];
  visibilidadProvincias?: string[];
  sexo?: string;
  edad?: number;
  intereses?: string[];
  etiquetas?: string[];
  fotos?: string[];
  searchKeywords?: string[];
  historiasActivasCount?: number;
  hasActiveStories?: boolean;
  adminBlurProfilePhoto?: boolean;
  adminBlurFotosPerfil?: boolean;
  adminBlurStories?: boolean;
  adminBlurGallery?: boolean;
  mediaBlurFlags?: Record<string, boolean>;
  adminBlurAt?: string;
  banned?: boolean;
  moderationTag?: string;
  groomingTag?: boolean;
  potentialPedophileTag?: boolean;
  fakeProfileTag?: string;
  shuffleFeatured?: boolean;
  shuffleVisitor?: boolean;
  visitorChatId?: string;
  /** Bound server alias for a targeted anon-to-anon connection. */
  visitorMatchAnonId?: string;
};

let cachedProfiles: ApiProfile[] = [];
let cachedProfilesAt = 0;
let cachedAnonymousOnline = 0;
let cachedAnonymousAt = 0;
let cachedVisitors: ApiProfile[] = [];
let cachedVisitorsAt = 0;
let cachedRegisteredCount = 0;
let cachedRegisteredAt = 0;

function fieldString(fields: any, key: string) {
  return fields?.[key]?.stringValue || "";
}

function fieldBool(fields: any, key: string) {
  return fields?.[key]?.booleanValue === true;
}

function fieldInstant(fields: any, key: string) {
  const raw = fields?.[key]?.timestampValue || fields?.[key]?.stringValue || "";
  const ms = Date.parse(String(raw || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function fieldArrayStrings(fields: any, key: string) {
  return (
    fields?.[key]?.arrayValue?.values
      ?.map((v: any) => v.stringValue)
      ?.filter(Boolean) || []
  );
}

function fieldInt(fields: any, key: string) {
  return Number(fields?.[key]?.integerValue || fields?.[key]?.doubleValue || 0);
}

function shuffleArray<T>(arr: T[]) {
  const copy = [...arr];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }

  return copy;
}

function isProfileOnlineForBadge(profile: ApiProfile, now = Date.now()) {
  return isShuffleProfileOnline(profile, now, ONLINE_WINDOW_MS);
}

function withPresenceBadge(profile: ApiProfile, now = Date.now()): ApiProfile {
  const visible = isLastSeenPublic(profile);
  const withBadge = {
    ...profile,
    mostrarUltimaVez: visible,
    showOnline: visible && isProfileOnlineForBadge(profile, now),
  };
  return stripPublicPresence(withBadge, visible);
}

function isAnonymousDocActive(doc: any, now = Date.now()) {
  const fields = doc?.fields || {};
  const seenMs = fieldInstant(fields, "lastSeenAt") || fieldInstant(fields, "updatedAt");
  if (!seenMs || seenMs > now + 30_000) return false;

  // Product rule: keep the visitor card (and green indicator) for three hours
  // after their last connection. Match / DM authorization remains short-lived;
  // stale sessions must not receive messages even while the card is visible.
  if (!anonShuffleVisible(seenMs, now)) return false;
  const expiresMs = fieldInstant(fields, "expiresAt");
  if (expiresMs && expiresMs <= now) return false;
  return true;
}

function visitorDocToProfile(doc: any, now = Date.now()): ApiProfile | null {
  if (!isAnonymousDocActive(doc, now)) return null;
  const fields = doc?.fields || {};
  const source = fieldString(fields, "source");
  if (source && source !== "anon_match_presence") return null;

  const presenceId = String(doc?.name || "").split("/").pop() || fieldString(fields, "anonId");
  const chatSessionId =
    sanitizeShuffleVisitorChatId(fieldString(fields, "chatSessionId")) ||
    sanitizeShuffleVisitorChatId(presenceId);
  if (!chatSessionId) return null;

  const seenMs = fieldInstant(fields, "lastSeenAt") || fieldInstant(fields, "updatedAt") || now;
  const lastActive = new Date(seenMs).toISOString();

  const firebaseAuthUid = fieldString(fields, "authUid");
  return {
    uid: chatSessionId,
    authUid: firebaseAuthUid || chatSessionId,
    aliasIds: [...new Set([chatSessionId, presenceId, firebaseAuthUid].filter(Boolean))],
    username: "Anónimo",
    usernameLower: "",
    bio: "En la app ahora",
    photo: "",
    fotos: [],
    lastActive,
    presenceAt: lastActive,
    online: true,
    showOnline: true,
    mostrarUltimaVez: true,
    pais: fieldString(fields, "pais"),
    provincia: fieldString(fields, "provincia"),
    visibilidadPaises: fieldArrayStrings(fields, "visibilidadPaises"),
    visibilidadProvincias: fieldArrayStrings(fields, "visibilidadProvincias"),
    shuffleVisitor: true,
    visitorChatId: chatSessionId,
    visitorMatchAnonId: sanitizeShuffleVisitorChatId(presenceId),
    banned: false,
  };
}

function publishShuffleProfile(profile: ApiProfile) {
  return profile.shuffleVisitor ? forceShuffleVisitorOnline(profile) : withPresenceBadge(profile);
}

async function runStructuredQuery(structuredQuery: Record<string, unknown>) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) {
    throw new Error(`Firestore runQuery ${res.status}`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) return [];

  return json.map((row: any) => row.document).filter(Boolean);
}

async function runQuery(
  collectionId: string,
  options?: {
    limit?: number;
    orderBy?: { field: string; direction?: "ASCENDING" | "DESCENDING" };
    minLastSeenAt?: string;
  },
) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId }],
    limit: options?.limit || 500,
  };

  if (options?.minLastSeenAt) {
    // Server-side cutoff: never bill reads for stale anonymous presence rows.
    // Live presence heartbeats always write lastSeenAt as an ISO UTC string.
    structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: "lastSeenAt" },
        op: "GREATER_THAN_OR_EQUAL",
        value: { stringValue: options.minLastSeenAt },
      },
    };
  }

  if (options?.orderBy) {
    structuredQuery.orderBy = [
      {
        field: { fieldPath: options.orderBy.field },
        direction: options.orderBy.direction || "DESCENDING",
      },
    ];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) {
    throw new Error(`Firestore runQuery ${collectionId} ${res.status}`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) return [];

  return json.map((row: any) => row.document).filter(Boolean);
}

async function runCollectionCount(collectionId: string) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runAggregationQuery?key=${API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      structuredAggregationQuery: {
        aggregations: [{ alias: "total", count: {} }],
        structuredQuery: {
          from: [{ collectionId }],
        },
      },
    }),
  });

  if (!res.ok) return 0;

  const json = await res.json();
  const rows = Array.isArray(json) ? json : [json];
  const value = rows[0]?.result?.aggregateFields?.total?.integerValue;
  return Number(value || 0);
}

function rawToProfile(raw: Record<string, unknown>, fallbackUid = ""): ApiProfile {
  const fotos = Array.isArray(raw.fotos)
    ? raw.fotos.map((value) => String(value || "")).filter(Boolean)
    : [];
  const intereses = Array.isArray(raw.intereses)
    ? raw.intereses.map((value) => String(value || "")).filter(Boolean)
    : [];
  const etiquetas = Array.isArray(raw.etiquetas)
    ? raw.etiquetas.map((value) => String(value || "")).filter(Boolean)
    : [];
  const searchKeywords = Array.isArray(raw.searchKeywords)
    ? raw.searchKeywords.map((value) => String(value || "")).filter(Boolean)
    : [];

  const presenceAt = String(
    raw.lastActiveAt || raw.lastSeenAt || raw.lastActive || "",
  );
  const lastActive = String(
    presenceAt || raw.updatedAt || raw.createdAt || raw.fechaCreacion || "",
  );

  const historiasActivasCount =
    Number(raw.historiasActivasCount || 0) ||
    Number(raw.activeStoriesCount || 0) ||
    Number(raw.storiesCount || 0) ||
    Number(raw.historias || 0);

  const docId = String(raw.id || fallbackUid || "").trim();
  const firebaseUid = String(raw.uid || raw.firebaseUid || "").trim();
  const profileUid = String(raw.profileUid || "").trim();
  const ownerUid = String(raw.ownerUid || "").trim();
  const aliasIds = Array.isArray(raw.aliasIds)
    ? raw.aliasIds.map((value) => String(value || "")).filter(Boolean)
    : [];

  const legacyModerationTag = String(raw.moderationTag || "");
  const profile: ApiProfile = {
    uid: docId || firebaseUid || fallbackUid || "",
    authUid: firebaseUid || docId || fallbackUid || "",
    firebaseUid: firebaseUid || undefined,
    profileUid: profileUid || undefined,
    ownerUid: ownerUid || undefined,
    aliasIds: [
      ...new Set(
        [docId, firebaseUid, profileUid, ownerUid, fallbackUid, ...aliasIds].filter(Boolean),
      ),
    ],
    username:
      normalizeUsername(
        String(raw.username || raw.usernameLower || raw.nombre || "usuario"),
      ) || "usuario",
    usernameLower: resolveUsernameLower({
      username: String(raw.username || raw.nombre || ""),
      usernameLower: String(raw.usernameLower || ""),
    }),
    bio: String(raw.bio || raw.descripcion || "Sin descripcion."),
    photo: String(raw.fotoPrincipal || raw.photoURL || fotos[0] || ""),
    coverPhoto: String(
      raw.fotoPortada || raw.coverPhoto || raw.portada || raw.heroPhoto || "",
    ),
    coverVideo: String(raw.videoPortada || raw.coverVideo || ""),
    lastActive,
    presenceAt: presenceAt || undefined,
    online: raw.online === true,
    email: String(raw.email || ""),
    provincia: String(raw.provincia || raw.region || ""),
    ciudad: String(raw.ciudad || ""),
    pais: String(raw.pais || raw.country || raw.countryCode || ""),
    visibilidadPaises: Array.isArray(raw.visibilidadPaises)
      ? raw.visibilidadPaises.map((value) => String(value || "")).filter(Boolean)
      : [],
    visibilidadProvincias: Array.isArray(raw.visibilidadProvincias)
      ? raw.visibilidadProvincias.map((value) => String(value || "")).filter(Boolean)
      : [],
    sexo: String(raw.sexo || ""),
    edad: Number(raw.edad || 0),
    intereses,
    etiquetas,
    fotos,
    searchKeywords,
    historiasActivasCount,
    hasActiveStories:
      raw.hasActiveStories === true || raw.tieneHistoriasActivas === true,
    adminBlurProfilePhoto: raw.adminBlurProfilePhoto === true,
    adminBlurFotosPerfil: raw.adminBlurFotosPerfil === true,
    adminBlurStories: raw.adminBlurStories === true,
    adminBlurGallery: raw.adminBlurGallery === true,
    mediaBlurFlags:
      raw.mediaBlurFlags && typeof raw.mediaBlurFlags === "object"
        ? (raw.mediaBlurFlags as Record<string, boolean>)
        : undefined,
    adminBlurAt: String(raw.adminBlurAt || ""),
    banned:
      raw.banned === true ||
      raw.suspendido === true ||
      String(raw.estado || "") === "bloqueado",
    mostrarUltimaVez: raw.mostrarUltimaVez !== false,
    moderationTag: legacyModerationTag === "roleplay" ? "roleplay" : "",
    groomingTag: raw.groomingTag === true || legacyModerationTag === "grooming",
    potentialPedophileTag: raw.potentialPedophileTag === true || legacyModerationTag === "potential_pedophile",
    fakeProfileTag: String(raw.fakeProfileTag || ""),
  };

  return withPresenceBadge(profile);
}

function docToProfile(doc: any): ApiProfile {
  const raw = parseFirestoreDoc(doc);
  const fallbackUid = String(doc?.name || "").split("/").pop() || "";
  return rawToProfile(raw, fallbackUid);
}

function profileMatchesQueryText(profile: ApiProfile, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const username = String(profile.username || "").toLowerCase();
  if (username.startsWith(needle) || username.includes(needle)) return true;

  const haystack = [
    profile.bio,
    profile.provincia,
    profile.ciudad,
    ...(profile.intereses || []),
    ...(profile.searchKeywords || []),
    ...(profile.etiquetas || []),
  ]
    .join(" ")
    .toLowerCase();

  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((token) => haystack.includes(token));
  }

  return haystack.includes(needle);
}

function appendSearchProfile(
  doc: any,
  seen: Set<string>,
  results: ApiProfile[],
) {
  const raw = parseFirestoreDoc(doc);
  if (!isPublicProfile(raw)) return;

  const profile = withResolvedCountry(docToProfile(doc));
  if (profile.banned || !profile.username || profile.username.toLowerCase() === "usuario") {
    return;
  }

  const keys = shuffleProfileDedupeKeys(profile);
  if (keys.length > 0 && keys.some((key) => seen.has(key))) return;

  for (const key of keys) {
    seen.add(key);
  }

  results.push(profile);
}

async function searchProfilesByQuery(
  query: string,
  limit = SHUFFLE_SEARCH_LIMIT,
  forceFresh = false,
) {
  const q = normalizeUsername(query).toLowerCase();
  if (!q) return [];

  const seen = new Set<string>();
  const results: ApiProfile[] = [];

  try {
    if (q.length >= 2) {
      const exactDocs = await runStructuredQuery({
        from: [{ collectionId: "usuarios" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "usernameLower" },
            op: "EQUAL",
            value: { stringValue: q },
          },
        },
        limit: 5,
      });
      exactDocs.forEach((doc) => appendSearchProfile(doc, seen, results));
    }

    const prefixDocs = await runStructuredQuery({
      from: [{ collectionId: "usuarios" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "usernameLower" },
                op: "GREATER_THAN_OR_EQUAL",
                value: { stringValue: q },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: "usernameLower" },
                op: "LESS_THAN_OR_EQUAL",
                value: { stringValue: `${q}\uf8ff` },
              },
            },
          ],
        },
      },
      limit,
    });
    prefixDocs.forEach((doc) => appendSearchProfile(doc, seen, results));
  } catch (error) {
    console.error("shuffle username search failed", error);
  }

  if (results.length < limit) {
    const cached = await getProfilesCached(forceFresh);
    for (const profile of cached) {
      if (results.length >= limit) break;
      if (!profileMatchesQueryText(profile, q)) continue;

      const keys = shuffleProfileDedupeKeys(profile);
      if (keys.length > 0 && keys.some((key) => seen.has(key))) continue;

      for (const key of keys) {
        seen.add(key);
      }
      results.push(profile);
    }
  }

  return results.slice(0, limit);
}

function withResolvedCountry(profile: ApiProfile): ApiProfile {
  const resolved = resolveProfileCountryCode(profile);
  return resolved ? { ...profile, pais: resolved } : profile;
}

async function getRegisteredCountCached(force = false) {
  const now = Date.now();
  if (!force && cachedRegisteredCount > 0 && now - cachedRegisteredAt < STATS_REFRESH_MS) {
    return cachedRegisteredCount;
  }

  const stats = await readPublicStats();
  if (stats?.registeredUsersCount && now - stats.updatedAt < STATS_REFRESH_MS) {
    cachedRegisteredCount = stats.registeredUsersCount;
    cachedRegisteredAt = now;
    return cachedRegisteredCount;
  }

  // The header counter sits on top of the list, so it must count the people you
  // can actually reach: the eligible pool, not every `usuarios` doc. A raw
  // collection count also includes banned accounts, which never show up.
  const pool = await getProfilesCached(force);
  const count = pool.length > 0 ? pool.length : await runCollectionCount("usuarios");
  cachedRegisteredCount = count;
  cachedRegisteredAt = now;

  void writePublicStats({ registeredUsersCount: count }).catch(() => {});
  return count;
}

function isShuffleEligibleProfile(profile: ApiProfile) {
  return !profile.banned && !!profile.username && profile.username.toLowerCase() !== "usuario";
}

async function fetchProfilesUncached(force = false) {
  const now = Date.now();

  if (!force && cachedProfiles.length > 0 && now - cachedProfilesAt < PROFILE_CACHE_MS) {
    return cachedProfiles;
  }

  const rows = await runCollectionQueryAll(
    "usuarios",
    "usernameLower",
    "ASCENDING",
    SHUFFLE_FETCH_PAGE_SIZE,
    SHUFFLE_FETCH_MAX_PAGES,
  );

  const profiles = dedupeShuffleProfiles(
    rows
      .filter((raw) => isPublicProfile(raw))
      .map((raw) => withResolvedCountry(rawToProfile(raw)))
      .filter(isShuffleEligibleProfile),
  );

  cachedProfiles = profiles;
  cachedProfilesAt = now;

  return profiles;
}

let profileScanInFlight: Promise<ApiProfile[]> | null = null;

async function getProfilesCached(force = false): Promise<ApiProfile[]> {
  const now = Date.now();
  if (!force && cachedProfiles.length > 0 && now - cachedProfilesAt < PROFILE_CACHE_MS) {
    return cachedProfiles;
  }
  if (profileScanInFlight) return profileScanInFlight;
  const pending = fetchProfilesUncached(force);
  profileScanInFlight = pending;
  try {
    return await pending;
  } finally {
    if (profileScanInFlight === pending) profileScanInFlight = null;
  }
}

async function getAnonymousOnlineCached(forceFresh = false) {
  const visitors = await getLiveShuffleVisitors(forceFresh);
  cachedAnonymousOnline = visitors.length;
  cachedAnonymousAt = Date.now();
  return cachedAnonymousOnline;
}

async function fetchLiveShuffleVisitorsUncached(force = false) {
  const now = Date.now();
  if (!force && cachedVisitorsAt > 0 && now - cachedVisitorsAt < VISITOR_CACHE_MS) {
    return cachedVisitors;
  }

  try {
    const docs = await runQuery("anonimos_activos", {
      limit: VISITOR_SCAN_LIMIT,
      orderBy: { field: "lastSeenAt", direction: "DESCENDING" },
      minLastSeenAt: new Date(now - ANON_SHUFFLE_VISIBILITY_MS).toISOString(),
    });
    const uniqueDocs = collapseRowsByOwner(
      docs.filter((doc: any) => isAnonymousDocActive(doc, now)),
      (doc: any) =>
        fieldString(doc?.fields, "authUid") ||
        String(doc?.name || "").split("/").pop() ||
        "",
      (doc: any) =>
        fieldInstant(doc?.fields, "lastSeenAt") ||
        fieldInstant(doc?.fields, "updatedAt") ||
        0,
    );
    const visitors = dedupeShuffleProfiles(
      uniqueDocs
        .map((doc: any) => visitorDocToProfile(doc, now))
        .filter((profile): profile is ApiProfile => Boolean(profile)),
    );
    cachedVisitors = visitors;
    cachedVisitorsAt = now;
    return visitors;
  } catch {
    // A failed read must not freeze an empty list for the cache window.
    // That hid live anons on solo-online until the next cold instance.
    return cachedVisitors;
  }
}

let visitorScanInFlight: Promise<ApiProfile[]> | null = null;

async function getLiveShuffleVisitors(force = false): Promise<ApiProfile[]> {
  const now = Date.now();
  if (!force && cachedVisitorsAt > 0 && now - cachedVisitorsAt < VISITOR_CACHE_MS) {
    return cachedVisitors;
  }
  // One Firestore scan per warm SSR instance, even under simultaneous client polls.
  if (visitorScanInFlight) return visitorScanInFlight;
  const pending = fetchLiveShuffleVisitorsUncached(force);
  visitorScanInFlight = pending;
  try {
    return await pending;
  } finally {
    if (visitorScanInFlight === pending) visitorScanInFlight = null;
  }
}

async function resolveLiveCounts(countOnly: boolean) {
  const stats = await readPublicStats();
  const now = Date.now();
  const statsFresh = stats && now - stats.updatedAt < STATS_REFRESH_MS;

  if (countOnly && statsFresh) {
    const anonymousOnline = await getAnonymousOnlineCached(false);
    const registered = stats!.registeredUsersCount;
    return {
      profilesCreated: registered,
      anonymousOnline,
      totalLive: registered + anonymousOnline,
    };
  }

  const [profilesCreated, anonymousOnline] = await Promise.all([
    countOnly ? getRegisteredCountCached(false) : getRegisteredCountCached(false),
    // Let the shared 20s visitor cache expire naturally, even if stats are stale.
    getAnonymousOnlineCached(false),
  ]);

  const totalLive = profilesCreated + anonymousOnline;

  if (countOnly || !statsFresh) {
    void writePublicStats({
      registeredUsersCount: profilesCreated,
      anonymousOnlineCount: anonymousOnline,
    }).catch(() => {});
  }

  return { profilesCreated, anonymousOnline, totalLive };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const q = String(searchParams.get("q") || "").trim().toLowerCase();
    const visitorsOnly = searchParams.get("visitors") === "1";
    const poolFull = searchParams.get("pool") === "full";
    const requestedLimit = Number(searchParams.get("limit") || 0);
    const shouldShuffle = searchParams.get("shuffle") === "1";
    const countOnly = searchParams.get("countOnly") === "1";
    const force = searchParams.get("force") === "1";
    const filters = parseShuffleFiltersFromSearchParams(searchParams);
    const viewer = parseViewerGeoTarget(
      searchParams,
      req.headers.get("cf-ipcountry") || req.headers.get("x-country-code"),
    );

    if (visitorsOnly) {
      const visitors = await getLiveShuffleVisitors(false);
      return shuffleJson(req, {
        ok: true,
        profiles: visitors.map((profile) => publishShuffleProfile(profile)),
        featuredProfiles: [],
        profilesCreated: cachedRegisteredCount,
        anonymousOnline: visitors.length,
        totalLive: cachedRegisteredCount + visitors.length,
        filteredCount: visitors.length,
        returned: visitors.length,
        dedupeVersion: SHUFFLE_DEDUPE_VERSION,
        ts: Date.now(),
      }, { publicVisitorSlice: true });
    }

    const { profilesCreated, anonymousOnline, totalLive } = await resolveLiveCounts(countOnly);

    if (countOnly) {
      return shuffleJson(req, {
        ok: true,
        profiles: [],
        featuredProfiles: [],
        profilesCreated,
        anonymousOnline,
        totalLive,
        filteredCount: 0,
        returned: 0,
        dedupeVersion: SHUFFLE_DEDUPE_VERSION,
        ts: Date.now(),
      });
    }

    const allProfiles = q
      ? await searchProfilesByQuery(q, SHUFFLE_SEARCH_LIMIT, force)
      : await getProfilesCached(force);
    const filteredByDiscovery = allProfiles.filter(
      (profile) =>
        profileIsVisibleToViewer(profile, viewer) &&
        profileMatchesShuffleServerFilters(profile, filters),
    );

    const liveVisitors = q
      ? []
      : (await getLiveShuffleVisitors(false)).filter(
          (profile) =>
            profileIsVisibleToViewer(profile, viewer) &&
            profileMatchesShuffleServerFilters(profile, filters),
        );

    const filtered = dedupeShuffleProfiles([...filteredByDiscovery, ...liveVisitors]);

    const ordered = shouldShuffle && !q ? shuffleArray(filtered) : filtered;

    const activeBoosts = await getActiveBoostProfiles();
    const boostUidOrder = activeBoosts
      .slice(0, BOOST_TOP_SLOTS)
      .map((row) => String(row.uid || ""))
      .filter(Boolean);

    const featuredProfiles = uniqueShuffleWindow(
      boostUidOrder
        .map((uid) =>
          filteredByDiscovery.find((profile) =>
            shuffleProfileMatchesBoostUid(profile, uid),
          ),
        )
        .filter(Boolean)
        .map((profile) => ({ ...withPresenceBadge(profile!), shuffleFeatured: true })),
    );

    const featuredKeys = new Set<string>();
    for (const profile of featuredProfiles) {
      for (const key of shuffleProfileDedupeKeys(profile)) {
        featuredKeys.add(key);
      }
    }

    const responseLimit = poolFull
      ? filtered.length
      : requestedLimit > 0
        ? Math.min(requestedLimit, SHUFFLE_RESPONSE_LIMIT)
        : filtered.length;

    const selected = dedupeShuffleProfiles(
      ordered
        .filter((profile) => {
          const keys = shuffleProfileDedupeKeys(profile);
          return keys.length === 0 || !keys.some((key) => featuredKeys.has(key));
        })
        .slice(0, Math.min(responseLimit, filtered.length))
        .map((profile) => publishShuffleProfile(profile)),
    );

    const uniqueAll = uniqueShuffleWindow([...featuredProfiles, ...selected]);
    const uniqueFeatured = uniqueAll.filter((profile) => profile.shuffleFeatured);
    const uniqueSelected = uniqueAll.filter((profile) => !profile.shuffleFeatured);

    return shuffleJson(req, {
      ok: true,
      profiles: uniqueSelected,
      featuredProfiles: uniqueFeatured,
      profilesCreated,
      anonymousOnline,
      totalLive,
      filteredCount: filtered.length,
      returned: uniqueSelected.length,
      dedupeVersion: SHUFFLE_DEDUPE_VERSION,
      ts: Date.now(),
    });
  } catch (e: any) {
    const profilesCreated = cachedRegisteredCount || cachedProfiles.length;
    const totalLive = profilesCreated + cachedAnonymousOnline;

    return shuffleJson(
      req,
      {
        ok: false,
        error: e?.message || "unknown",
        profiles: uniqueShuffleWindow(cachedProfiles).slice(0, 35),
        featuredProfiles: [],
        profilesCreated,
        anonymousOnline: cachedAnonymousOnline,
        totalLive,
        returned: Math.min(35, cachedProfiles.length),
        dedupeVersion: SHUFFLE_DEDUPE_VERSION,
        ts: Date.now(),
      },
      { status: 200 },
    );
  }
}
