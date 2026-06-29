export function collectProfilePhotoUrls(profile: Record<string, unknown> | null | undefined) {
  const urls = new Set<string>();

  const add = (value: unknown) => {
    const url = String(value || "").trim();
    if (url) urls.add(url);
  };

  if (!profile) return [];

  add(profile.photo);
  add(profile.fotoPrincipal);
  add(profile.photoURL);
  add(profile.fotoPortada);
  add(profile.coverPhoto);
  add(profile.portada);
  add(profile.heroPhoto);

  if (Array.isArray(profile.fotos)) {
    for (const entry of profile.fotos) add(entry);
  }

  return [...urls];
}

export function readMediaBlurFlags(profile: Record<string, unknown> | null | undefined) {
  const raw = profile?.mediaBlurFlags;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === true) next[key] = true;
  }
  return next;
}

export function profilePhotoIsBlurred(
  url: string,
  profile: Record<string, unknown> | null | undefined,
) {
  if (!url) return false;

  const flags = readMediaBlurFlags(profile);
  if (flags[url] === true) return true;

  return (
    profile?.adminBlurProfilePhoto === true || profile?.adminBlurFotosPerfil === true
  );
}
