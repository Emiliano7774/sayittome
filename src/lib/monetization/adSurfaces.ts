import { isMonetagWebEnabled } from "@/lib/monetization/monetagConfig";

/** Routes where third-party ad scripts must not load (chat, auth, admin). */
const BLOCKED_PREFIXES = ["/login", "/register", "/admin"];

function isChatSurfaceRoute(path: string) {
  return path === "/chats" || path.startsWith("/chat/");
}

/** Body classes that block Monetag (chats, sensitive media, consent overlays). */
const BLOCKED_BODY_CLASSES = [
  "sayittome-chat-open",
  "sayittome-sensitive-consent-open",
  "sayittome-story-viewer-open",
  "sayittome-entry-legal-open",
  "sayittome-report-open",
] as const;

export function isShuffleRoute(pathname: string) {
  const path = String(pathname || "/");
  return path === "/shuffle" || path.startsWith("/shuffle/");
}

function normalizePathname(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

/** Human-readable surface label for vignette opportunity diagnostics. */
export function resolveVignetteSurface(pathname: string) {
  const path = normalizePathname(pathname);
  if (path === "/") return "home";
  if (isShuffleRoute(path)) return "shuffle";
  if (path === "/stories" || path.startsWith("/stories/")) return "stories";
  if (path === "/boost" || path.startsWith("/boost/")) return "boost";
  if (path === "/settings" || path.startsWith("/settings/")) return "settings";
  if (path.startsWith("/u/")) return "profile";
  return "other";
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

  if (isChatSurfaceRoute(path)) {
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
 * Vignette-eligible surfaces (zone 11011520).
 * Includes /shuffle and main tabs; excludes auth, admin, and chat surfaces.
 */
export function isVignetteSurfaceEligible(pathname: string) {
  if (!isBaseMonetagAllowed(pathname)) {
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

/** @deprecated Alias — use isVignetteSurfaceEligible */
export function shouldLoadMonetagVignette(pathname: string) {
  return isVignetteSurfaceEligible(pathname);
}
