export function normalizeUsername(value: string) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, "");
}

export function isValidUsername(value: string) {
  const clean = normalizeUsername(value);
  return /^[a-zA-Z0-9._-]{3,24}$/.test(clean);
}

export async function isUsernameAvailable(username: string, currentUid: string) {
  const clean = normalizeUsername(username).toLowerCase();
  if (!clean) return false;

  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(clean)}?ts=${Date.now()}`, {
      cache: "no-store",
    });
    const json = await res.json();
    const profile = json?.profile;

    if (!profile) return true;
    return String(profile.uid || "") === currentUid;
  } catch {
    return true;
  }
}
