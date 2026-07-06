import { assertProfileOwner } from "@/lib/profile/owner";
import { normalizeUsername } from "@/lib/profile/username";

export const VERIFIED_QUERY_PARAM = "verified";
export const VERIFIED_QUERY_VALUE = "1";
export const VERIFIED_PROFILE_PUBLIC_HOST = "sytm.me";

/** Canonical public username for verified share links (no leading @). */
export function normalizeVerifiedProfileUsername(username: string) {
  let clean = normalizeUsername(username);
  if (clean.startsWith("@")) clean = clean.slice(1);
  return clean;
}

/** Visible verified link text, e.g. `sytm.me/@emiliano`. */
export function displayVerifiedProfileLink(username: string) {
  const slug = normalizeVerifiedProfileUsername(username).toLowerCase();
  return `${VERIFIED_PROFILE_PUBLIC_HOST}/@${slug}`;
}

/** Canonical HTTPS URL copied to clipboard, e.g. `https://sytm.me/@emiliano`. */
export function getVerifiedProfileUrl(username: string) {
  return `https://${displayVerifiedProfileLink(username)}`;
}

/** @deprecated Use getVerifiedProfileUrl for copy/share. */
export function getVerifiedProfileLink(username: string, origin?: string) {
  void origin;
  return getVerifiedProfileUrl(username);
}

export function isVerifiedProfileLink(search?: string | URLSearchParams | null) {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(search || "");

  return params.get(VERIFIED_QUERY_PARAM) === VERIFIED_QUERY_VALUE;
}

export type ParsedVerifiedProfileLink = {
  username: string;
  profileHref: string;
  displayLink: string;
};

const VERIFIED_PUBLIC_LINK_RE =
  /(?:https?:\/\/)?(?:www\.)?sytm\.me\/@([a-zA-Z0-9._-]{3,24})\/?(?:\?[^\s#]*)?(?:#[^\s]*)?$/i;

const VERIFIED_AT_HANDLE_RE =
  /(?:https?:\/\/)?(?:[\w.-]+)\/@([a-zA-Z0-9._-]{3,24})\/?(?:\?[^\s#]*)?(?:#[^\s]*)?$/i;

const VERIFIED_LEGACY_PROFILE_RE =
  /(?:https?:\/\/)?(?:[\w.-]+)\/u\/([a-zA-Z0-9._-]{3,24})(?:\?[^\s#]*)?(?:#[^\s]*)?$/i;

function parseVerifiedProfileLinkCandidate(text: string): ParsedVerifiedProfileLink | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let rawUsername = "";

  const publicMatch = trimmed.match(VERIFIED_PUBLIC_LINK_RE);
  if (publicMatch?.[1]) {
    rawUsername = publicMatch[1];
  } else {
    const atMatch = trimmed.match(VERIFIED_AT_HANDLE_RE);
    if (atMatch?.[1]) {
      rawUsername = atMatch[1];
    } else {
      const legacyMatch = trimmed.match(VERIFIED_LEGACY_PROFILE_RE);
      if (!legacyMatch?.[1]) return null;
      const hasVerified =
        /[?&]verified=1(?:&|$)/i.test(trimmed) || /#verified=1/i.test(trimmed);
      if (!hasVerified) return null;
      rawUsername = legacyMatch[1];
    }
  }

  const username = normalizeVerifiedProfileUsername(rawUsername);
  if (!username) return null;

  return {
    username,
    profileHref: `/u/${encodeURIComponent(username)}?verified=1`,
    displayLink: displayVerifiedProfileLink(username),
  };
}

/** Detects a copied verified profile link inside a chat text message. */
export function parseVerifiedProfileLinkInText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = parseVerifiedProfileLinkCandidate(trimmed);
  if (direct) return direct;

  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?sytm\.me\/@([a-zA-Z0-9._-]{3,24})/i,
  );
  if (urlMatch?.[1]) {
    const username = normalizeVerifiedProfileUsername(urlMatch[1]);
    if (!username) return null;
    return {
      username,
      profileHref: `/u/${encodeURIComponent(username)}?verified=1`,
      displayLink: displayVerifiedProfileLink(username),
    };
  }

  return null;
}

export function getVerifiedProfileInAppHref(username: string) {
  const slug = normalizeVerifiedProfileUsername(username);
  return `/u/${encodeURIComponent(slug)}?verified=1`;
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

  const link = getVerifiedProfileUrl(username);
  const ok = await writeTextToClipboard(link);

  if (ok) {
    return { ok: true as const, link };
  }

  return { ok: false as const, link };
}
