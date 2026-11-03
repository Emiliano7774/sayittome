/**
 * Only publicly shared profile/gallery media with an existing Firebase Storage
 * download token is eligible. Never proxy arbitrary hosts or private chat media.
 */
const BUCKETS = new Set(["sayittome-app.appspot.com", "sayittome-app.firebasestorage.app"]);
const OBJECT_PATH = /^usuarios\/[^/]{1,140}\/(?:fotos|perfil|galeria)\/.+/i;
const TOKEN = /^[a-zA-Z0-9_-]{20,100}$/;

export function canonicalPublicProfilePhoto(raw: string): string | null {
  if (typeof raw !== "string" || raw.length < 30 || raw.length > 2300) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.hostname !== "firebasestorage.googleapis.com" || u.port || u.username || u.password) return null;
    const path = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(u.pathname);
    if (!path || !BUCKETS.has(path[1])) return null;
    const objectName = decodeURIComponent(path[2]);
    if (!OBJECT_PATH.test(objectName) || objectName.includes("..") || objectName.includes("\\") || objectName.length > 900) return null;
    const token = u.searchParams.get("token");
    if (!token || !TOKEN.test(token) || u.searchParams.get("alt") !== "media") return null;
    // No source-supplied arbitrary URL parameters are forwarded upstream.
    return `https://firebasestorage.googleapis.com/v0/b/${path[1]}/o/${encodeURIComponent(objectName)}?alt=media&token=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

export const PROFILE_THUMB_WIDTHS = [96, 256, 384, 640, 960, 1280] as const;
export type ProfileThumbWidth = (typeof PROFILE_THUMB_WIDTHS)[number];

export function profileThumbnailUrl(raw: string, width: ProfileThumbWidth = 640): string | null {
  const safeSource = canonicalPublicProfilePhoto(raw);
  if (!safeSource) return null;
  return `/api/profile-thumbnail?u=${encodeURIComponent(safeSource)}&w=${width}`;
}
