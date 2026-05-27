type ProfileLike = Record<string, unknown> | null | undefined;

function firstPhotoFromList(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "";
  const first = value[0];
  if (typeof first === "string") return first.trim();
  if (first && typeof first === "object" && "url" in first) {
    return String((first as { url?: unknown }).url || "").trim();
  }
  return "";
}

export function resolveProfilePhoto(profile: ProfileLike) {
  if (!profile) return "";

  return String(
    profile.fotoPrincipal ||
      profile.photoURL ||
      profile.photo ||
      firstPhotoFromList(profile.fotos) ||
      "",
  ).trim();
}
