import { NextResponse } from "next/server";

import { isLastSeenPublic } from "@/lib/profile/lastSeenVisibility";
import { formatProfileCreatedAtLabel } from "@/lib/profile/resolveProfileCreatedAt";
import { isActiveWithinWindow, isRecentlyActive } from "@/lib/presence";
import { parseFirestoreDoc } from "@/lib/firestore/rest";
import { isPublicProfile } from "@/lib/profile/isPublicProfile";
import { normalizeProfileMediaSources } from "@/lib/profile/mediaSource";

const API_KEY = "AIzaSyBpQKCAwE-8Td3ZuaDqE3nvNwRGDGY8vdk";
const PROJECT_ID = "sayittome-app";

function val(field: any) {
  if (!field) return "";
  return field.stringValue || field.integerValue || field.doubleValue || "";
}

function str(fields: any, key: string) {
  return String(val(fields?.[key]) || "");
}

function int(fields: any, key: string) {
  return Number(fields?.[key]?.integerValue || fields?.[key]?.doubleValue || 0);
}

function ts(fields: any, key: string) {
  return fields?.[key]?.timestampValue || "";
}

function mapStr(fields: any, key: string) {
  const map = fields?.[key]?.mapValue?.fields;
  if (!map || typeof map !== "object") return {};

  const out: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(map)) {
    out[entryKey] = String((entryValue as { stringValue?: string })?.stringValue || "");
  }
  return out;
}


export async function GET(
  _req: Request,
  ctx: { params: Promise<{ username: string }> }
) {
  const { username } = await ctx.params;
  const wanted = decodeURIComponent(username || "").toLowerCase();

  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

  const body = {
    structuredQuery: {
      from: [{ collectionId: "usuarios" }],
      where: {
        compositeFilter: {
          op: "OR",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "usernameLower" },
                op: "EQUAL",
                value: { stringValue: wanted },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: "username" },
                op: "EQUAL",
                value: { stringValue: username },
              },
            },
          ],
        },
      },
      limit: 1,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = await res.json();
  const found = Array.isArray(json) ? json.find((x: any) => x.document) : null;

  if (!found?.document) {
    return NextResponse.json({ ok: false, profile: null });
  }

  const rawProfile = parseFirestoreDoc(found.document);
  if (!isPublicProfile(rawProfile)) {
    return NextResponse.json({ ok: false, profile: null, reason: "invalid_profile" });
  }

  const fields = found.document.fields || {};
  const fotos =
    fields?.fotos?.arrayValue?.values
      ?.map((v: any) => v.stringValue)
      ?.filter(Boolean) || [];

  const videos =
    fields?.videos?.arrayValue?.values
      ?.map((v: any) => v.stringValue)
      ?.filter(Boolean) || [];

  const presenceAt =
    ts(fields, "lastActiveAt") ||
    ts(fields, "lastSeenAt") ||
    ts(fields, "lastActive") ||
    undefined;

  const online = fields?.online?.booleanValue === true;

  const fotoPrincipal =
    str(fields, "fotoPrincipal") || str(fields, "photoURL") || fotos[0] || "";

  const mostrarUltimaVez = isLastSeenPublic({
    mostrarUltimaVez: fields?.mostrarUltimaVez?.booleanValue,
  });

  const profile = {
    uid: str(fields, "uid") || String(found.document.name || "").split("/").pop() || "",
    email: str(fields, "email"),
    username: str(fields, "username") || str(fields, "usernameLower") || username,
    bio: str(fields, "bio") || str(fields, "descripcion") || "",
    provincia: str(fields, "provincia"),
    mostrarProvincia:
      fields?.mostrarProvincia?.booleanValue !== false &&
      fields?.ubicacionVisible?.booleanValue !== false &&
      fields?.geoVisible?.booleanValue !== false,
    mostrarUltimaVez,
    fotoPrincipal,
    photo: fotoPrincipal,
    photoURL: fotoPrincipal,
    fotoPortada:
      str(fields, "fotoPortada") ||
      str(fields, "coverPhoto") ||
      str(fields, "portada") ||
      str(fields, "heroPhoto") ||
      "",
    videoPortada: str(fields, "videoPortada") || str(fields, "coverVideo") || "",
    fotos: fotos,
    videos: videos,
    fotoMediaSources: normalizeProfileMediaSources(mapStr(fields, "fotoMediaSources")),
    likes:
      int(fields, "likesPerfilCount") ||
      int(fields, "likesCount") ||
      int(fields, "likes"),
    conversaciones: int(fields, "conversacionesCount"),
    seguidores: int(fields, "seguidoresCount") || int(fields, "followersCount"),
    createdAtLabel: formatProfileCreatedAtLabel(rawProfile),
    originalCreatedAt:
      ts(fields, "originalCreatedAt") || ts(fields, "createdAt") || undefined,
    createdAt: ts(fields, "createdAt") || undefined,
    fechaCreacion: ts(fields, "fechaCreacion") || undefined,
    fechaRegistro: ts(fields, "fechaRegistro") || undefined,
    registrationDate: ts(fields, "registrationDate") || undefined,
    _firestoreCreateTime: String(rawProfile._firestoreCreateTime || ""),
    presenceAt,
    lastActive: presenceAt,
    online,
    showOnline: presenceAt ? isActiveWithinWindow(presenceAt, presenceAt) : online,
    adminBlurProfilePhoto: fields?.adminBlurProfilePhoto?.booleanValue === true,
    adminBlurFotosPerfil: fields?.adminBlurFotosPerfil?.booleanValue === true,
    adminBlurStories: fields?.adminBlurStories?.booleanValue === true,
    adminBlurGallery: fields?.adminBlurGallery?.booleanValue === true,
    adminBlurReason: str(fields, "adminBlurReason"),
  };

  return NextResponse.json({ ok: true, profile });
}

