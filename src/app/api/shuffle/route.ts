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

function shuffleArray<T>(arr: T[]) {
  const copy = [...arr];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

async function getCollection(
  col: string,
  pageSize = 500,
) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${col}?pageSize=${pageSize}&key=${API_KEY}`;

  const res = await fetch(url, {
    cache: "no-store",
  });

  const json = await res.json();

  return Array.isArray(json.documents)
    ? json.documents
    : [];
}

export async function GET(req: Request) {
  try {
    const { searchParams } =
      new URL(req.url);

    const q =
      String(
        searchParams.get("q") || "",
      ).toLowerCase();

    const limit =
      Number(
        searchParams.get("limit") || 35,
      ) || 35;

    const shuffle =
      searchParams.get("shuffle") === "1";

    const [userDocs, anonDocs] =
      await Promise.all([
        getCollection("usuarios", 500),

        getCollection(
          "anonimos_activos",
          250,
        ).catch(() => []),
      ]);

    let profiles = userDocs
      .map((doc: any) => {
        const f = doc.fields || {};

        const fotos =
          f?.fotos?.arrayValue?.values
            ?.map(
              (v: any) =>
                v.stringValue,
            )
            ?.filter(Boolean) || [];

        return {
          uid:
            str(f, "uid") ||
            String(doc.name || "")
              .split("/")
              .pop() ||
            "",

          username:
            str(f, "username") ||
            str(f, "usernameLower") ||
            str(f, "nombre") ||
            "usuario",

          bio:
            str(f, "bio") ||
            str(f, "descripcion") ||
            "Sin descripcion.",

          photo:
            str(f, "fotoPrincipal") ||
            str(f, "photoURL") ||
            fotos[0] ||
            "",

          lastActive:
            ts(f, "lastActive") ||
            ts(f, "updatedAt") ||
            ts(f, "createdAt"),

          banned:
            bool(f, "banned") ||
            bool(f, "suspendido") ||
            str(f, "estado") ===
              "bloqueado",
        };
      })
      .filter((p: any) => !p.banned);

    if (q) {
      profiles = profiles.filter(
        (p: any) => {
          return (
            String(
              p.username || "",
            )
              .toLowerCase()
              .includes(q) ||
            String(
              p.bio || "",
            )
              .toLowerCase()
              .includes(q)
          );
        },
      );
    }

    if (shuffle && !q) {
      profiles =
        shuffleArray(profiles);
    }

    const anonymousOnline =
      anonDocs.length;

    return NextResponse.json({
      ok: true,

      profiles:
        profiles.slice(0, limit),

      profilesCreated:
        profiles.length,

      anonymousOnline,

      totalLive:
        profiles.length +
        anonymousOnline,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,

      error:
        e?.message || "unknown",

      profiles: [],

      profilesCreated: 0,

      anonymousOnline: 0,

      totalLive: 0,
    });
  }
}
