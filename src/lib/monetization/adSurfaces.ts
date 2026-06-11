import { isNativeAppShell } from "@/lib/app/nativeShell";
import { isMonetagWebEnabled } from "@/lib/monetization/monetagConfig";

/** Routes where third-party ad scripts must not load (chat, auth, admin). */
const BLOCKED_PREFIXES = ["/login", "/register", "/admin", "/chat"];

/** Body classes that block Monetag (chats, sensitive media, consent overlays). */
const BLOCKED_BODY_CLASSES = [
  "sayittome-chat-open",
  "sayittome-sensitive-consent-open",
  "sayittome-story-viewer-open",
  "sayittome-entry-legal-open",
] as const;

export function isShuffleRoute(pathname: string) {
  const path = String(pathname || "/");
  return path === "/shuffle" || path.startsWith("/shuffle/");
}

export function isMonetagBodyBlocked() {
  if (typeof document === "undefined") return false;
  return BLOCKED_BODY_CLASSES.some((className) =>
    document.body.classList.contains(className),
  );
}

function isBaseMonetagAllowed(pathname: string) {
  if (!isMonetagWebEnabled()) return false;

  const path = String(pathname || "/");

  if (BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }

  if (/\/chat\/?$/.test(path)) {
    return false;
  }

  if (isMonetagBodyBlocked()) {
    return false;
  }

  return true;
}

/** @deprecated Use isBaseMonetagAllowed — kept for any legacy AdMob surface imports. */
export function shouldLoadWebAds(pathname: string) {
  return isBaseMonetagAllowed(pathname);
}

/**
 * Global Monetag In-Page Push.
 * Web shuffle uses inline feed slots instead; native APK still gets global IPP on shuffle.
 */
export function shouldLoadMonetagInPagePush(pathname: string) {
  if (!isBaseMonetagAllowed(pathname)) {
    return false;
  }

  if (isShuffleRoute(pathname) && !isNativeAppShell()) {
    return false;
  }

  return true;
}

export function shouldLoadMonetagVignette(pathname: string) {
  if (!shouldLoadMonetagInPagePush(pathname)) {
    return false;
  }

  if (isShuffleRoute(pathname)) {
    return false;
  }

  if (
    typeof document !== "undefined" &&
    document.body.classList.contains("sayittome-admob-banner-visible")
  ) {
    return false;
  }

  return true;
}

/** Inline Monetag slots inside shuffle feed (web browser only). */
export function shouldLoadMonetagShuffleInline(pathname: string) {
  if (!isBaseMonetagAllowed(pathname)) return false;
  if (!isShuffleRoute(pathname)) return false;
  if (isNativeAppShell()) return false;
  return true;
}
