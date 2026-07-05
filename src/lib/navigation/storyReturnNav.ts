import { peekNativeNavPath } from "@/lib/navigation/nativeNavStack";

const RETURN_KEY = "sayittome-story-return";

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

export function stashStoryReturnTo(pathname: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(RETURN_KEY, normalizePath(pathname));
}

export function peekStoryReturnTo() {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(RETURN_KEY);
  return value ? normalizePath(value) : null;
}

export function consumeStoryReturnTo() {
  const value = peekStoryReturnTo();
  if (value && typeof window !== "undefined") {
    window.sessionStorage.removeItem(RETURN_KEY);
  }
  return value;
}

export function resolveStoryReturnPath(effectivePath: string) {
  const path = normalizePath(effectivePath);
  if (path === "/shuffle") return "/shuffle";
  if (path === "/stories" || path.startsWith("/stories/")) return "/stories";
  if (path.startsWith("/u/")) return path;
  return "/stories";
}

export function resolveStoryViewerExitDestination(currentPath?: string) {
  const path =
    typeof window === "undefined"
      ? normalizePath(currentPath || "/stories")
      : normalizePath(currentPath || window.location.pathname);

  const explicit = consumeStoryReturnTo();
  if (explicit) return explicit;

  const previous = peekNativeNavPath(path);
  if (previous && previous !== path) {
    return previous;
  }

  return "/stories";
}
