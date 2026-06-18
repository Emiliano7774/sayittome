import { NextResponse } from "next/server";

import { getActiveBoostProfiles } from "@/lib/boost/service";
import { BOOST_TOP_SLOTS } from "@/lib/boost/constants";
import { readPublicStats, writePublicStats } from "@/lib/firestore/publicStats";
import { isShuffleProfileOnline, ONLINE_WINDOW_MS } from "@/lib/presence";
import { parseFirestoreDoc, runCollectionQueryAll } from "@/lib/firestore/rest";
import { isLastSeenPublic, stripPublicPresence } from "@/lib/profile/lastSeenVisibility";
import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import { resolveProfileCountryCode } from "@/lib/geo/countries";
import { normalizeUsername } from "@/lib/profile/username";
import { dedupeShuffleProfiles, resolveUsernameLower, shuffleProfileDedupeKeys } from "@/lib/shuffle/dedupeProfiles";
import {
  parseShuffleFiltersFromSearchParams,
  profileMatchesShuffleServerFilters,
} from "@/lib/shuffle/serverFilters";

export const dynamic = "force-dynamic";

const API_KEY = "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const PROJECT_ID = "sayittome-app";

const PROFILE_CACHE_MS = 8 * 60_000;
const ANON_CACHE_MS = 5 * 60_000;
const STATS_REFRESH_MS = 10 * 60_000;
/** Max profiles returned in one API response (client holds the full shuffle pool). */
const SHUFFLE_RESPONSE_LIMIT = 10_000;
/** Max profiles considered when searching by username text. */
const SHUFFLE_SEARCH_LIMIT = 200;
const SHUFFLE_FETCH_PAGE_SIZE = 500;
const SHUFFLE_FETCH_MAX_PAGES = 40;
const ANON_SCAN_LIMIT = 40;
const ANON_ACTIVE_MS = 90 * 1000;

type ApiProfile = {
  uid: string;
  authUid?: string;
  username: string;
  usernameLower?: string;
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
  banned?: boolean;
};

let cachedProfiles: ApiProfile[] = [];
let cachedProfilesAt = 0;
let cachedAnonymousOnline = 0;
let cachedAnonymousAt = 0;
let cachedRegisteredCount = 0;
let cachedRegisteredAt = 0;

function fieldString(fields: any, key: string) {
  return fields?.[key]?.stringValue || "";
}

function fieldBool(fields: any, key: string) {
  return fields?.[key]?.booleanValue === true;
}

function fieldTimestamp(fields: any, key: string) {
  return fields?.[key]?.timestampValue || "";
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
  const expiresAt = fieldTimestamp(fields, "expiresAt");
  const lastSeenAt =
    fieldTimestamp(fields, "lastSeenAt") || fieldTimestamp(fields, "updatedAt");

  if (expiresAt) {
    const expiresDate = new Date(expiresAt);
    if (!Number.isNaN(expiresDate.getTime())) {
      return expiresDate.getTime() > now;
    }
  }

  if (!lastSeenAt) return false;

  const seenDate = new Date(lastSeenAt);
  if (Number.isNaN(seenDate.getTime())) return false;

  return now - seenDate.getTime() <= ANON_ACTIVE_MS;
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
  },
) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId }],
    limit: options?.limit || 500,
  };

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

  const profile: ApiProfile = {
    uid: String(raw.id || raw.uid || fallbackUid || ""),
    authUid: String(raw.uid || raw.id || fallbackUid || "").trim(),
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
    banned:
      raw.banned === true ||
      raw.suspendido === true ||
      String(raw.estado || "") === "bloqueado",
    mostrarUltimaVez: raw.mostrarUltimaVez !== false,
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

async function searchProfilesByQuery(query: string, limit = SHUFFLE_SEARCH_LIMIT) {
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
    const cached = await getProfilesCached(false);
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

  const count = await runCollectionCount("usuarios");
  cachedRegisteredCount = count;
  cachedRegisteredAt = now;

  void writePublicStats({ registeredUsersCount: count }).catch(() => {});
  return count;
}

function isShuffleEligibleProfile(profile: ApiProfile) {
  return !profile.banned && !!profile.username && profile.username.toLowerCase() !== "usuario";
}

async function getProfilesCached(force = false) {
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

async function getAnonymousOnlineCached(forceFresh = false) {
  const now = Date.now();

  if (!forceFresh && now - cachedAnonymousAt < ANON_CACHE_MS) {
    return cachedAnonymousOnline;
  }

  const stats = await readPublicStats();
  if (
    !forceFresh &&
    stats?.anonymousOnlineCount != null &&
    now - stats.updatedAt < ANON_CACHE_MS
  ) {
    cachedAnonymousOnline = stats.anonymousOnlineCount;
    cachedAnonymousAt = now;
    return cachedAnonymousOnline;
  }

  try {
    const docs = await runQuery("anonimos_activos", { limit: ANON_SCAN_LIMIT });
    cachedAnonymousOnline = docs.filter((doc: any) => isAnonymousDocActive(doc, now)).length;
    cachedAnonymousAt = now;

    void writePublicStats({ anonymousOnlineCount: cachedAnonymousOnline }).catch(() => {});
    return cachedAnonymousOnline;
  } catch {
    cachedAnonymousAt = now;
    return cachedAnonymousOnline;
  }
}

async function resolveLiveCounts(countOnly: boolean) {
  const stats = await readPublicStats();
  const now = Date.now();
  const statsFresh = stats && now - stats.updatedAt < STATS_REFRESH_MS;

  if (countOnly && statsFresh) {
    return {
      profilesCreated: stats!.registeredUsersCount,
      anonymousOnline: stats!.anonymousOnlineCount,
      totalLive: stats!.registeredUsersCount + stats!.anonymousOnlineCount,
    };
  }

  const [profilesCreated, anonymousOnline] = await Promise.all([
    countOnly ? getRegisteredCountCached(false) : getRegisteredCountCached(false),
    getAnonymousOnlineCached(!statsFresh),
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
    const poolFull = searchParams.get("pool") === "full";
    const requestedLimit = Number(searchParams.get("limit") || 0);
    const shouldShuffle = searchParams.get("shuffle") === "1";
    const countOnly = searchParams.get("countOnly") === "1";
    const force = searchParams.get("force") === "1";
    const filters = parseShuffleFiltersFromSearchParams(searchParams);

    const { profilesCreated, anonymousOnline, totalLive } = await resolveLiveCounts(countOnly);

    if (countOnly) {
      return NextResponse.json({
        ok: true,
        profiles: [],
        profilesCreated,
        anonymousOnline,
        totalLive,
        filteredCount: 0,
        returned: 0,
        ts: Date.now(),
      });
    }

    const allProfiles = q
      ? await searchProfilesByQuery(q, SHUFFLE_SEARCH_LIMIT)
      : await getProfilesCached(force);
    const filteredByDiscovery = allProfiles.filter((profile) =>
      profileMatchesShuffleServerFilters(profile, filters),
    );

    const filtered = filteredByDiscovery;

    const ordered = shouldShuffle && !q ? shuffleArray(filtered) : filtered;

    const activeBoosts = await getActiveBoostProfiles();
    const boostUidOrder = activeBoosts
      .slice(0, BOOST_TOP_SLOTS)
      .map((row) => String(row.uid || ""))
      .filter(Boolean);

    const featuredProfiles = dedupeShuffleProfiles(
      boostUidOrder
        .map((uid) => filteredByDiscovery.find((profile) => profile.uid === uid))
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
        .map((profile) => withPresenceBadge(profile)),
    );

    return NextResponse.json({
      ok: true,
      profiles: selected,
      featuredProfiles,
      profilesCreated,
      anonymousOnline,
      totalLive,
      filteredCount: filteredByDiscovery.length,
      returned: selected.length,
      ts: Date.now(),
    });
  } catch (e: any) {
    const profilesCreated = cachedRegisteredCount || cachedProfiles.length;
    const totalLive = profilesCreated + cachedAnonymousOnline;

    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "unknown",
        profiles: cachedProfiles.slice(0, 35),
        profilesCreated,
        anonymousOnline: cachedAnonymousOnline,
        totalLive,
        returned: Math.min(35, cachedProfiles.length),
        ts: Date.now(),
      },
      { status: 200 },
    );
  }
}
