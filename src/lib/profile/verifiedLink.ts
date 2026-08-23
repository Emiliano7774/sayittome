import { recordNativeNavPath } from "@/lib/navigation/nativeNavStack";
import { stashProfileReturnTo } from "@/lib/navigation/profileReturnNav";
import { assertProfileOwner } from "@/lib/profile/owner";
import { scheduleVerifiedProfileLinkClaimRetry } from "@/lib/profile/verifiedProfileLinkClaimRetry";
import { issueVerifiedProfileLinkTicket } from "@/lib/profile/verifiedProfileLinkTicket";
import { isValidUsername, normalizeUsername } from "@/lib/profile/username";

/** Shown when Copy is pressed while a prior link claim is still in flight. */
export const VERIFIED_PROFILE_LINK_CLAIM_PENDING_COPY_MESSAGE =
  "El link anterior todavía se está verificando. Reintentá en unos segundos";

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
  matchedText: string;
};

export const OFFICIAL_PROFILE_LINK_MIN_HIT_PX = 44;
export const OFFICIAL_PROFILE_LINK_URL_ATTR = "data-official-profile-link-url";
export const OFFICIAL_PROFILE_LINK_ROW_ATTR = "data-official-profile-link-row";

/** Bubble URL, then verified row, then delivery/read receipts. */
export function chatOfficialProfileLinkSlots() {
  return ["bubble-url", "verified-row", "receipts"] as const;
}

function rawHasExplicitPort(trimmed: string) {
  const scheme = trimmed.indexOf("://");
  if (scheme < 0) return false;
  const hostPart = trimmed.slice(scheme + 3).split("/")[0] || "";
  const host = hostPart.includes("@")
    ? hostPart.slice(hostPart.lastIndexOf("@") + 1)
    : hostPart;
  return /:\d+$/.test(host);
}

export function getOfficialProfileInAppHref(username: string) {
  const slug = normalizeVerifiedProfileUsername(username).toLowerCase();
  return `/u/${encodeURIComponent(slug)}`;
}

/**
 * Exact official profile copy only: HTTPS + host sytm.me + /@username.
 * Uppercase username and a single trailing slash are canonical. Nothing else.
 */
export function parseExactOfficialProfileLinkMessage(
  text: string,
): ParsedVerifiedProfileLink | null {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  if (trimmed.includes("?") || trimmed.includes("#")) return null;
  if (rawHasExplicitPort(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port) return null;
  if (url.hostname !== VERIFIED_PROFILE_PUBLIC_HOST) return null;
  if (url.search || url.hash) return null;

  const path = url.pathname.replace(/\/+$/, "");
  const match = path.match(/^\/@([a-zA-Z0-9._-]{3,24})$/);
  if (!match?.[1]) return null;

  const username = normalizeVerifiedProfileUsername(match[1]);
  if (!username || !isValidUsername(username)) return null;

  const slug = username.toLowerCase();
  return {
    username: slug,
    profileHref: getOfficialProfileInAppHref(slug),
    displayLink: displayVerifiedProfileLink(slug),
    matchedText: trimmed,
  };
}

/** Exact official copied link — extra text or lookalike hosts stay plain text. */
export function parseVerifiedProfileLinkInText(text: string) {
  return parseExactOfficialProfileLinkMessage(text);
}

export function getVerifiedProfileInAppHref(username: string) {
  return getOfficialProfileInAppHref(username);
}

/** Keep chat/Shuffle on the native back stack before opening /u/{username}. */
export function rememberChatBeforeOfficialProfileOpen() {
  if (typeof window === "undefined") return;
  const path = String(window.location.pathname || "/")
    .split("?")[0]
    .split("#")[0];
  if (!path.startsWith("/chat/") && path !== "/shuffle" && !path.startsWith("/u/")) {
    return;
  }
  recordNativeNavPath(path);
  stashProfileReturnTo(path);
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

export async function copyVerifiedProfileLink(
  username: string,
  options?: {
    overwriteTicket?: boolean;
    /** Test hooks — production omits these. */
    ownerUid?: string;
    assertOwner?: (username: string) => Promise<boolean>;
    writeText?: (text: string) => Promise<boolean>;
    scheduleRetry?: (ownerUid: string) => void;
    callIssue?: (username: string) => Promise<{
      ticketId: string;
      text: string;
      expiresAtMs: number;
    }>;
  },
) {
  const allowed = options?.assertOwner
    ? await options.assertOwner(username)
    : await assertProfileOwner(username);
  if (!allowed) {
    return {
      ok: false as const,
      link: "",
      denied: true as const,
      reason: "denied" as const,
    };
  }

  let ownerUid = String(options?.ownerUid || "").trim();
  if (!ownerUid) {
    const { auth } = await import("@/lib/firebase");
    ownerUid = String(auth.currentUser?.uid || "").trim();
  }
  if (!ownerUid) {
    return {
      ok: false as const,
      link: "",
      reason: "issue_failed" as const,
    };
  }

  const issued = await issueVerifiedProfileLinkTicket({
    username,
    ownerUid,
    overwrite: options?.overwriteTicket !== false,
    callIssue: options?.callIssue,
  });
  if (!issued.ok) {
    if (issued.reason === "claim_pending") {
      (options?.scheduleRetry ?? scheduleVerifiedProfileLinkClaimRetry)(ownerUid);
      return {
        ok: false as const,
        link: "",
        reason: "claim_pending" as const,
      };
    }
    return {
      ok: false as const,
      link: "",
      reason: "issue_failed" as const,
    };
  }

  const ticket = issued.ticket;
  const writeText = options?.writeText ?? writeTextToClipboard;
  const ok = await writeText(ticket.text);
  if (ok) {
    return { ok: true as const, link: ticket.text, ticketId: ticket.ticketId };
  }

  // Ticket is reserved even if clipboard fails — caller can show manual copy UI.
  return {
    ok: false as const,
    link: ticket.text,
    ticketId: ticket.ticketId,
    reason: "clipboard_failed" as const,
  };
}

/** Clipboard-only; never issues a second ticket (native modal re-copy). */
export async function recopyVerifiedProfileLinkText(link: string) {
  const text = String(link || "").trim();
  if (!text) return { ok: false as const };
  const ok = await writeTextToClipboard(text);
  return ok ? { ok: true as const } : { ok: false as const };
}
