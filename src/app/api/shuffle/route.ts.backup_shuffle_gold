import { NextResponse } from "next/server";

const API_KEY = "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const PROJECT_ID = "sayittome-app";

function str(f: any, k: string) {
  return f?.[k]?.stringValue || "";
}

function bool(f: any, k: string) {
  return f?.[k]?.booleanValue === true;
}

function ts(f: any, k: string) {
  return f?.[k]?.timestampValue || "";
}

function recent(v: string) {
  if (!v) return false;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() <= 15 * 60 * 1000;
}

async function getCollection(col: string, pageSize = 250) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${col}?pageSize=${pageSize}&key=${API_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  return Array.isArray(json.documents) ? json.documents : [];
}

export async function GET() {
  try {
    const [userDocs, anonDocs] = await Promise.all([
      getCollection("usuarios", 250),
      getCollection("anonimos_activos", 250).catch(() => []),
    ]);

    const profiles = userDocs
      .map((doc: any) => {
        const f = doc.fields || {};
        const fotos =
          f?.fotos?.arrayValue?.values
            ?.map((v: any) => v.stringValue)
            ?.filter(Boolean) || [];

        return {
          uid: str(f, "uid") || String(doc.name || "").split("/").pop() || "",
          username: str(f, "username") || str(f, "usernameLower") || str(f, "nombre") || "usuario",
          bio: str(f, "bio") || str(f, "descripcion") || "Sin descripción.",
          photo: str(f, "fotoPrincipal") || str(f, "photoURL") || fotos[0] || "",
          lastActive: ts(f, "lastActive") || ts(f, "updatedAt") || ts(f, "createdAt"),
          banned: bool(f, "banned") || bool(f, "suspendido") || str(f, "estado") === "bloqueado",
        };
      })
      .filter((p: any) => !p.banned);

    const anonymousOnline = anonDocs.filter((doc: any) => {
      const f = doc.fields || {};
      return bool(f, "online") || recent(ts(f, "updatedAt")) || recent(ts(f, "lastActive"));
    }).length;

    return NextResponse.json({
      ok: true,
      profiles,
      profilesCreated: profiles.length,
      anonymousOnline,
      totalLive: profiles.length + anonymousOnline,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message || "unknown",
      profiles: [],
      profilesCreated: 0,
      anonymousOnline: 0,
      totalLive: 0,
    });
  }
}
