import { assertProfileOwner } from "@/lib/profile/owner";

export const VERIFIED_QUERY_PARAM = "verified";
export const VERIFIED_QUERY_VALUE = "1";

export function getVerifiedProfileLink(username: string, origin?: string) {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "https://sayittome-app.web.app");

  const slug = encodeURIComponent(username.trim());

  return `${base}/u/${slug}?${VERIFIED_QUERY_PARAM}=${VERIFIED_QUERY_VALUE}`;
}

export function isVerifiedProfileLink(search?: string | URLSearchParams | null) {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(search || "");

  return params.get(VERIFIED_QUERY_PARAM) === VERIFIED_QUERY_VALUE;
}

export async function copyVerifiedProfileLink(username: string) {
  const allowed = await assertProfileOwner(username);
  if (!allowed) {
    return { ok: false as const, link: "", denied: true as const };
  }

  const link = getVerifiedProfileLink(username);

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(link);
    return { ok: true as const, link };
  }

  return { ok: false as const, link };
}
