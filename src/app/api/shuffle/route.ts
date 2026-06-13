import { NextResponse } from "next/server";

import { getActiveBoostProfiles } from "@/lib/boost/service";
import { BOOST_TOP_SLOTS } from "@/lib/boost/constants";
import { readPublicStats, writePublicStats } from "@/lib/firestore/publicStats";
import { isShuffleProfileOnline, ONLINE_WINDOW_MS } from "@/lib/presence";
import { parseFirestoreDoc } from "@/lib/firestore/rest";
import { isLastSeenPublic, stripPublicPresence } from "@/lib/profile/lastSeenVisibility";
import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import { resolveProfileCountryCode } from "@/lib/geo/countries";
import { normalizeUsername } from "@/lib/profile/username";
import { dedupeShuffleProfiles } from "@/lib/shuffle/dedupeProfiles";
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
const SHUFFLE_POOL_LIMIT = 50;
const ANON_SCAN_LIMIT = 40;
const ANON_ACTIVE_MS = 90 * 1000;

type ApiProfile = {
  uid: string;
  username: string;
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
    limit: options?.limit || SHUFFLE_POOL_LIMIT,
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

function docToProfile(doc: any): ApiProfile {
  const fields = doc.fields || {};
  const fotos = fieldArrayStrings(fields, "fotos");
  const intereses = fieldArrayStrings(fields, "intereses");
  const etiquetas = fieldArrayStrings(fields, "etiquetas");
  const searchKeywords = fieldArrayStrings(fields, "searchKeywords");

  const presenceAt =
    fieldTimestamp(fields, "lastActiveAt") ||
    fieldTimestamp(fields, "lastSeenAt") ||
    fieldTimestamp(fields, "lastActive");

  const lastActive =
    presenceAt ||
    fieldTimestamp(fields, "updatedAt") ||
    fieldTimestamp(fields, "createdAt");

  const historiasActivasCount =
    fieldInt(fields, "historiasActivasCount") ||
    fieldInt(fields, "activeStoriesCount") ||
    fieldInt(fields, "storiesCount") ||
    fieldInt(fields, "historias");

  const profile: ApiProfile = {
    uid:
      fieldString(fields, "uid") ||
      String(doc.name || "").split("/").pop() ||
      "",
    username:
      normalizeUsername(
        fieldString(fields, "username") ||
          fieldString(fields, "usernameLower") ||
          fieldString(fields, "nombre") ||
          "usuario",
      ) || "usuario",
    bio:
      fieldString(fields, "bio") ||
      fieldString(fields, "descripcion") ||
      "Sin descripcion.",
    photo:
      fieldString(fields, "fotoPrincipal") ||
      fieldString(fields, "photoURL") ||
      fotos[0] ||
      "",
    coverPhoto:
      fieldString(fields, "fotoPortada") ||
      fieldString(fields, "coverPhoto") ||
      fieldString(fields, "portada") ||
      fieldString(fields, "heroPhoto") ||
      "",
    coverVideo:
      fieldString(fields, "videoPortada") ||
      fieldString(fields, "coverVideo") ||
      "",
    lastActive,
    presenceAt: presenceAt || undefined,
    online: fieldBool(fields, "online"),
    email: fieldString(fields, "email"),
    provincia: fieldString(fields, "provincia") || fieldString(fields, "region"),
    ciudad: fieldString(fields, "ciudad"),
    pais:
      fieldString(fields, "pais") ||
      fieldString(fields, "country") ||
      fieldString(fields, "countryCode"),
    sexo: fieldString(fields, "sexo"),
    edad: fieldInt(fields, "edad"),
    intereses,
    etiquetas,
    fotos,
    searchKeywords,
    historiasActivasCount,
    hasActiveStories:
      fieldBool(fields, "hasActiveStories") ||
      fieldBool(fields, "tieneHistoriasActivas"),
    adminBlurProfilePhoto: fieldBool(fields, "adminBlurProfilePhoto"),
    adminBlurFotosPerfil: fieldBool(fields, "adminBlurFotosPerfil"),
    adminBlurStories: fieldBool(fields, "adminBlurStories"),
    adminBlurGallery: fieldBool(fields, "adminBlurGallery"),
    banned:
      fieldBool(fields, "banned") ||
      fieldBool(fields, "suspendido") ||
      fieldString(fields, "estado") === "bloqueado",
    mostrarUltimaVez: fields?.mostrarUltimaVez?.booleanValue !== false,
  };

  return withPresenceBadge(profile);
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

async function getProfilesCached(force = false) {
  const now = Date.now();

  if (!force && cachedProfiles.length > 0 && now - cachedProfilesAt < PROFILE_CACHE_MS) {
    return cachedProfiles;
  }

  let docs: any[] = [];

  try {
    docs = await runQuery("usuarios", {
      limit: SHUFFLE_POOL_LIMIT,
      orderBy: { field: "lastActiveAt", direction: "DESCENDING" },
    });
  } catch {
    docs = await runQuery("usuarios", { limit: SHUFFLE_POOL_LIMIT });
  }

  const profiles = dedupeShuffleProfiles(
    docs
      .map((doc: any) => ({ doc, raw: parseFirestoreDoc(doc) }))
      .filter(({ raw }) => isPublicProfile(raw))
      .map(({ doc }) => withResolvedCountry(docToProfile(doc)))
      .filter(
        (p: ApiProfile) => !p.banned && !!p.username && p.username.toLowerCase() !== "usuario",
      ),
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
    const limit = Math.min(Number(searchParams.get("limit") || 35) || 35, SHUFFLE_POOL_LIMIT);
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

    const allProfiles = await getProfilesCached(force);
    const filteredByDiscovery = allProfiles.filter((profile) =>
      profileMatchesShuffleServerFilters(profile, filters),
    );

    let filtered = filteredByDiscovery;

    if (q) {
      filtered = filtered.filter((p) => {
        return (
          String(p.username || "").toLowerCase().includes(q) ||
          String(p.bio || "").toLowerCase().includes(q)
        );
      });
    }

    const ordered = shouldShuffle && !q ? shuffleArray(filtered) : filtered;
    const selected = ordered.slice(0, limit).map((profile) => withPresenceBadge(profile));

    const activeBoosts = await getActiveBoostProfiles();
    const boostUidOrder = activeBoosts
      .slice(0, BOOST_TOP_SLOTS)
      .map((row) => String(row.uid || ""))
      .filter(Boolean);

    const featuredProfiles = boostUidOrder
      .map((uid) => filteredByDiscovery.find((profile) => profile.uid === uid))
      .filter(Boolean)
      .map((profile) => ({ ...withPresenceBadge(profile!), shuffleFeatured: true }));

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
