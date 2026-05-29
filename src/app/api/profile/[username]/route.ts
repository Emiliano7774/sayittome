import { NextResponse } from "next/server";

import { isActiveWithinWindow, isRecentlyActive } from "@/lib/presence";
import { parseFirestoreDoc } from "@/lib/firestore/rest";
import { isPublicProfile } from "@/lib/profile/isPublicProfile";

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

function formatDate(v: string) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

  const presenceAt =
    ts(fields, "lastActiveAt") ||
    ts(fields, "lastSeenAt") ||
    ts(fields, "lastActive") ||
    undefined;

  const online = fields?.online?.booleanValue === true;

  const fotoPrincipal =
    str(fields, "fotoPrincipal") || str(fields, "photoURL") || fotos[0] || "";

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
    likes:
      int(fields, "likesPerfilCount") ||
      int(fields, "likesCount") ||
      int(fields, "likes"),
    conversaciones: int(fields, "conversacionesCount"),
    seguidores: int(fields, "seguidoresCount") || int(fields, "followersCount"),
    createdAtLabel: formatDate(ts(fields, "createdAt")),
    presenceAt,
    lastActive:
      presenceAt ||
      ts(fields, "updatedAt") ||
      ts(fields, "createdAt"),
    online,
    showOnline: isActiveWithinWindow(presenceAt, presenceAt || ts(fields, "updatedAt") || ts(fields, "createdAt")),
    adminBlurProfilePhoto: fields?.adminBlurProfilePhoto?.booleanValue === true,
    adminBlurFotosPerfil: fields?.adminBlurFotosPerfil?.booleanValue === true,
    adminBlurStories: fields?.adminBlurStories?.booleanValue === true,
    adminBlurGallery: fields?.adminBlurGallery?.booleanValue === true,
    adminBlurReason: str(fields, "adminBlurReason"),
  };

  return NextResponse.json({ ok: true, profile });
}

