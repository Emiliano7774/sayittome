import { peekNativeNavPath } from "@/lib/navigation/nativeNavStack";

const RETURN_KEY = "sayittome-story-return";

export type StoryViewerExitReason = "manual" | "auto";

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

function viewerPath(currentPath?: string) {
  return typeof window === "undefined"
    ? normalizePath(currentPath || "/stories")
    : normalizePath(currentPath || window.location.pathname);
}

/** Timer / auto-advance: stay in Historias — never switch main section to Shuffle. */
export function resolveStoryAutoExitDestination(currentPath?: string) {
  const explicit = peekStoryReturnTo();
  if (explicit && explicit !== "/shuffle") {
    return resolveStoryReturnPath(explicit);
  }
  if (typeof window === "undefined") {
    return resolveStoryReturnPath(viewerPath(currentPath));
  }
  return "/stories";
}

/** Manual close/back: honor stashed origin including exact Shuffle return. */
export function resolveStoryManualExitDestination(currentPath?: string) {
  const path = viewerPath(currentPath);

  const explicit = consumeStoryReturnTo();
  if (explicit) return resolveStoryReturnPath(explicit);

  const previous = peekNativeNavPath(path);
  if (previous && previous !== path) {
    return resolveStoryReturnPath(previous);
  }

  return "/stories";
}

export function resolveStoryViewerExitDestination(
  currentPath?: string,
  reason: StoryViewerExitReason = "manual",
) {
  return reason === "auto"
    ? resolveStoryAutoExitDestination(currentPath)
    : resolveStoryManualExitDestination(currentPath);
}
