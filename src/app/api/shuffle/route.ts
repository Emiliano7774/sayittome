import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_KEY = "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const PROJECT_ID = "sayittome-app";

type ApiProfile = {
  uid: string;
  username: string;
  bio: string;
  photo: string;
  lastActive?: string;
  banned?: boolean;
};

let cachedProfiles: ApiProfile[] = [];
let cachedProfilesAt = 0;
let cachedAnonymousOnline = 0;
let cachedAnonymousAt = 0;

const PROFILE_CACHE_MS = 10000;
const ANON_CACHE_MS = 6000;

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

async function runCollectionQuery(collectionId: string, limit = 500) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        limit,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Firestore runQuery ${collectionId} ${res.status}`);
  }

  const json = await res.json();

  if (!Array.isArray(json)) return [];

  return json
    .map((row: any) => row.document)
    .filter(Boolean);
}

function docToProfile(doc: any): ApiProfile {
  const fields = doc.fields || {};
  const fotos = fieldArrayStrings(fields, "fotos");

  return {
    uid:
      fieldString(fields, "uid") ||
      String(doc.name || "").split("/").pop() ||
      "",

    username:
      fieldString(fields, "username") ||
      fieldString(fields, "usernameLower") ||
      fieldString(fields, "nombre") ||
      "usuario",

    bio:
      fieldString(fields, "bio") ||
      fieldString(fields, "descripcion") ||
      "Sin descripcion.",

    photo:
      fieldString(fields, "fotoPrincipal") ||
      fieldString(fields, "photoURL") ||
      fotos[0] ||
      "",

    lastActive:
      fieldTimestamp(fields, "lastActive") ||
      fieldTimestamp(fields, "updatedAt") ||
      fieldTimestamp(fields, "createdAt"),

    banned:
      fieldBool(fields, "banned") ||
      fieldBool(fields, "suspendido") ||
      fieldString(fields, "estado") === "bloqueado",
  };
}

async function getProfilesCached() {
  const now = Date.now();

  if (cachedProfiles.length > 0 && now - cachedProfilesAt < PROFILE_CACHE_MS) {
    return cachedProfiles;
  }

  const docs = await runCollectionQuery("usuarios", 500);

  const profiles = docs
    .map(docToProfile)
    .filter((p: ApiProfile) => !p.banned && !!p.username);

  cachedProfiles = profiles;
  cachedProfilesAt = now;

  return profiles;
}

async function getAnonymousOnlineCached() {
  const now = Date.now();

  if (now - cachedAnonymousAt < ANON_CACHE_MS) {
    return cachedAnonymousOnline;
  }

  try {
    const docs = await runCollectionQuery("anonimos_activos", 250);
    cachedAnonymousOnline = docs.length;
    cachedAnonymousAt = now;
    return cachedAnonymousOnline;
  } catch {
    cachedAnonymousAt = now;
    return cachedAnonymousOnline;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const q = String(searchParams.get("q") || "").trim().toLowerCase();
    const limit = Number(searchParams.get("limit") || 35) || 35;
    const shouldShuffle = searchParams.get("shuffle") === "1";
    const countOnly = searchParams.get("countOnly") === "1";

    const [allProfiles, anonymousOnline] = await Promise.all([
      getProfilesCached(),
      getAnonymousOnlineCached(),
    ]);

    if (countOnly) {
      return NextResponse.json({
        ok: true,
        profiles: [],
        profilesCreated: allProfiles.length,
        anonymousOnline,
        totalLive: allProfiles.length + anonymousOnline,
        returned: 0,
        ts: Date.now(),
      });
    }

    let filtered = allProfiles;

    if (q) {
      filtered = allProfiles.filter((p) => {
        return (
          String(p.username || "").toLowerCase().includes(q) ||
          String(p.bio || "").toLowerCase().includes(q)
        );
      });
    }

    const ordered = shouldShuffle && !q ? shuffleArray(filtered) : filtered;
    const selected = ordered.slice(0, limit);

    return NextResponse.json({
      ok: true,
      profiles: selected,
      profilesCreated: allProfiles.length,
      anonymousOnline,
      totalLive: allProfiles.length + anonymousOnline,
      returned: selected.length,
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "unknown",
        profiles: cachedProfiles.slice(0, 35),
        profilesCreated: cachedProfiles.length,
        anonymousOnline: cachedAnonymousOnline,
        totalLive: cachedProfiles.length + cachedAnonymousOnline,
        returned: Math.min(35, cachedProfiles.length),
        ts: Date.now(),
      },
      { status: 200 }
    );
  }
}
