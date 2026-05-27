import { isNativeAppShell } from "@/lib/app/nativeShell";

/** Routes where third-party ad scripts must not load (chat, auth, admin). */
const BLOCKED_PREFIXES = ["/login", "/register", "/admin", "/chat"];

export function isShuffleRoute(pathname: string) {
  const path = String(pathname || "/");
  return path === "/shuffle" || path.startsWith("/shuffle/");
}

function isBaseAdsAllowed(pathname: string) {
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

export function shouldLoadWebAds(pathname: string) {
  return isBaseAdsAllowed(pathname);
}

/** AdMob interstitials must not interrupt shuffle browsing. */
export function shouldLoadAdMobInterstitials(pathname: string) {
  if (!shouldLoadWebAds(pathname)) {
    return false;
  }

  return !isShuffleRoute(pathname);
}

/** Routes where the fixed AdMob banner must not cover page chrome (e.g. shuffle toolbar). */
export function shouldShowAdMobBanner(pathname: string) {
  if (!shouldLoadWebAds(pathname)) {
    return false;
  }

  return !isShuffleRoute(pathname);
}

/**
 * Global Monetag In-Page Push.
 * Web shuffle uses inline feed slots instead; native APK still gets global IPP on shuffle.
 */
export function shouldLoadMonetagInPagePush(pathname: string) {
  if (!shouldLoadWebAds(pathname)) {
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
