/** Routes where third-party ad scripts must not load (chat, auth, admin). */
const BLOCKED_PREFIXES = ["/login", "/register", "/admin", "/chat"];

export function shouldLoadWebAds(pathname: string) {
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
