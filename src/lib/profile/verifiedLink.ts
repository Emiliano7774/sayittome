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

async function writeTextToClipboard(text: string): Promise<boolean> {
  if (typeof document === "undefined") return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // WebView / insecure context — fall through to execCommand
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export async function copyVerifiedProfileLink(username: string) {
  const allowed = await assertProfileOwner(username);
  if (!allowed) {
    return { ok: false as const, link: "", denied: true as const };
  }

  const link = getVerifiedProfileLink(username);
  const ok = await writeTextToClipboard(link);

  if (ok) {
    return { ok: true as const, link };
  }

  return { ok: false as const, link };
}
