import { peekNativeNavPath, popNativeNavPath } from "@/lib/navigation/nativeNavStack";
import { peekProfileReturnTo } from "@/lib/navigation/profileReturnNav";
import { releaseChatViewportLock } from "@/hooks/useChatViewportLock";
import { clearMainTabShellOverlay } from "@/lib/navigation/mainTabShellBridge";
import { resolveChatBackAction } from "@/lib/navigation/chatBackNavigation";

export type NativeBackResult =
  | { handled: true; hintKey?: string; navigateTo?: string; dismissChatKeyboard?: boolean }
  | { handled: false };

const ROOT_ROUTES = new Set(["/shuffle", "/"]);

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

/** Leave chat and return to the screen the user came from (shuffle, profile, chats, etc.). */
export function resolveChatBackDestination(pathname: string): string {
  stripNativeChatFullscreen();
  const path = normalizePath(pathname);

  let dest = popNativeNavPath(path);
  while (dest) {
    const normalized = normalizePath(dest);

    if (normalized.startsWith("/chat/")) {
      dest = popNativeNavPath(normalized);
      continue;
    }

    const profileChatMatch = normalized.match(/^\/u\/([^/]+)\/chat$/);
    if (profileChatMatch) {
      return `/u/${profileChatMatch[1]}`;
    }

    return normalized;
  }

  return "/chats";
}

/** Drop chat fullscreen shell classes so the previous tab can render with bottom nav. */
export function stripNativeChatFullscreen() {
  if (typeof document === "undefined") return;

  const body = document.body;
  body.classList.remove("sayittome-chat-fullscreen-open");
  releaseChatViewportLock();
}

/** Close open overlays before leaving the current screen. */
export function tryCloseNativeOverlays(): boolean {
  if (typeof document === "undefined") return false;

  const body = document.body;

  if (body.classList.contains("sayittome-chat-fullscreen-open")) {
    window.dispatchEvent(new Event("sayittome:close-chat-fullscreen"));
    return true;
  }

  if (body.classList.contains("sayittome-filters-open")) {
    window.dispatchEvent(new Event("sayittome:close-filters"));
    return true;
  }

  if (body.classList.contains("sayittome-story-viewer-open")) {
    window.dispatchEvent(new Event("sayittome:close-story"));
    return true;
  }

  if (body.classList.contains("sayittome-chats-selection-open")) {
    window.dispatchEvent(new Event("sayittome:exit-chats-selection"));
    return true;
  }

  if (body.classList.contains("sayittome-anon-chat-open")) {
    window.dispatchEvent(new Event("sayittome:close-anon-chat"));
    return true;
  }

  if (body.classList.contains("sayittome-profile-media-sheet-open")) {
    window.dispatchEvent(new Event("sayittome:close-profile-media-sheet"));
    return true;
  }

  if (body.classList.contains("sayittome-profile-viewer-open")) {
    window.dispatchEvent(new Event("sayittome:close-profile-viewer"));
    return true;
  }

  if (body.classList.contains("sayittome-profile-video-open")) {
    window.dispatchEvent(new Event("sayittome:close-profile-video"));
    return true;
  }

  if (body.classList.contains("sayittome-sensitive-consent-open")) {
    window.dispatchEvent(new Event("sayittome:close-sensitive-consent"));
    return true;
  }

  if (body.classList.contains("sayittome-anon-disclaimer-open")) {
    window.dispatchEvent(new Event("sayittome:close-anon-disclaimer"));
    return true;
  }

  if (body.classList.contains("sayittome-entry-legal-open")) {
    window.dispatchEvent(new Event("sayittome:close-entry-legal"));
    return true;
  }

  if (body.classList.contains("sayittome-report-open")) {
    window.dispatchEvent(new Event("sayittome:close-report"));
    return true;
  }

  if (body.classList.contains("sayittome-claim-history-open")) {
    window.dispatchEvent(new Event("sayittome:close-claim-history"));
    return true;
  }

  if (body.classList.contains("sayittome-notification-settings-open")) {
    window.dispatchEvent(new Event("sayittome:close-notification-settings"));
    return true;
  }

  if (body.classList.contains("sayittome-profile-options-open")) {
    window.dispatchEvent(new Event("sayittome:close-profile-options"));
    return true;
  }

  return false;
}

export function getNativeBackDestination(pathname: string): string | null {
  const path = normalizePath(pathname);

  if (path.startsWith("/chat/")) {
    return peekNativeNavPath(path) || "/chats";
  }

  if (path.startsWith("/u/") && path.endsWith("/chat")) return "/chats";
  if (path.startsWith("/u/")) {
    const returnTo = peekProfileReturnTo();
    if (returnTo) return returnTo;
    return "/shuffle";
  }

  if (path === "/stories/new") return "/shuffle";
  if (path.startsWith("/stories/")) return "/stories";
  if (path === "/stories") return "/shuffle";

  if (path.startsWith("/settings/")) return "/settings";
  if (path === "/settings") return "/shuffle";

  if (path === "/boost" || path.startsWith("/boost/")) return "/shuffle";
  if (path === "/app") return "/shuffle";
  if (path === "/") return "/shuffle";

  if (path.startsWith("/admin/")) {
    const parts = path.split("/").filter(Boolean);
    if (parts.length > 1) return "/admin";
    return "/shuffle";
  }

  if (path.startsWith("/register") || path.startsWith("/login")) return "/";

  return "/shuffle";
}

export function isNativeRootRoute(pathname: string) {
  return ROOT_ROUTES.has(normalizePath(pathname));
}

export function resolveNativeBack(pathname: string): NativeBackResult {
  if (tryCloseNativeOverlays()) {
    return { handled: true };
  }

  if (clearMainTabShellOverlay()) {
    return { handled: true };
  }

  const path = normalizePath(pathname);

  if (path.startsWith("/chat/")) {
    const chatAction = resolveChatBackAction(path);
    if (chatAction?.kind === "dismiss-keyboard") {
      return { handled: true, dismissChatKeyboard: true };
    }

    stripNativeChatFullscreen();
    return {
      handled: true,
      navigateTo: resolveChatBackDestination(path),
    };
  }

  if (isNativeRootRoute(path)) {
    return { handled: true, hintKey: "native_back_exit_hint" };
  }

  stripNativeChatFullscreen();

  const previous = popNativeNavPath(path);
  if (previous && previous !== path) {
    return { handled: true, navigateTo: previous };
  }

  const destination = getNativeBackDestination(path);
  if (!destination || destination === path) {
    return { handled: false };
  }

  return { handled: true, navigateTo: destination };
}

