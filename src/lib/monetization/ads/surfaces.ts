import { areAdsEnabled } from "@/lib/monetization/ads/config";

/** Routes where ads must never load (auth, admin, chat). */
const BLOCKED_PREFIXES = ["/login", "/register", "/admin", "/chat"];

export function isShuffleRoute(pathname: string) {
  const path = String(pathname || "/");
  return path === "/shuffle" || path.startsWith("/shuffle/");
}

function isBaseAdsAllowed(pathname: string) {
  if (!areAdsEnabled()) return false;

  const path = String(pathname || "/");

  if (BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }

  if (/\/chat\/?$/.test(path)) {
    return false;
  }

  if (typeof document !== "undefined" && document.body.classList.contains("sayittome-chat-open")) {
    return false;
  }

  return true;
}

/** INSERTION POINT: fixed bottom banner — gated by route in AdsBootstrap. */
export function shouldShowBanner(pathname: string) {
  if (!isBaseAdsAllowed(pathname)) return false;
  return !isShuffleRoute(pathname);
}

/** INSERTION POINT: full-screen interstitial — not on shuffle. */
export function shouldShowInterstitial(pathname: string) {
  if (!isBaseAdsAllowed(pathname)) return false;
  return !isShuffleRoute(pathname);
}

/** INSERTION POINT: inline feed ads inside shuffle lists. */
export function shouldShowFeedAds(pathname: string) {
  if (!isBaseAdsAllowed(pathname)) return false;
  return isShuffleRoute(pathname);
}
