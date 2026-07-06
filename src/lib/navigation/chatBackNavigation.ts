import { recordNativeNavPath } from "@/lib/navigation/nativeNavStack";

const CHAT_COMPOSER_SELECTOR = "[data-sayittome-chat-composer]";

type ChatBackPhase = "idle" | "keyboard-dismissed";

let chatBackPhase: ChatBackPhase = "idle";

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

export function resetChatBackNavigationState() {
  chatBackPhase = "idle";
}

export function isChatRoutePath(pathname: string) {
  return normalizePath(pathname).startsWith("/chat/");
}

function readChatComposer() {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(CHAT_COMPOSER_SELECTOR);
}

function isChatComposerFocused() {
  const input = readChatComposer();
  if (!input) return false;

  const active = document.activeElement;
  return active === input || input.contains(active);
}

function isVisualViewportKeyboardOpen() {
  if (typeof window === "undefined") return false;

  const viewport = window.visualViewport;
  if (!viewport) return false;

  return viewport.height < window.innerHeight * 0.86;
}

function isChatKeyboardUp() {
  return isChatComposerFocused() || isVisualViewportKeyboardOpen();
}

export function dismissChatComposerKeyboard() {
  const active = document.activeElement as HTMLElement | null;
  active?.blur?.();
  readChatComposer()?.blur();
}

/** Record the visible tab/screen before opening a chat thread. */
export function recordPathBeforeChatOpen() {
  if (typeof window === "undefined") return;

  const pathname = normalizePath(window.location.pathname);
  if (pathname.startsWith("/chat/")) return;

  // Prefer the real route (profile/shuffle) over a stale main-tab shell pointer.
  if (pathname.startsWith("/u/") || pathname === "/shuffle") {
    recordNativeNavPath(pathname);
    return;
  }

  const shellTab = window.__sayittomeActiveShellTab;
  const entry = shellTab ? normalizePath(shellTab) : pathname;
  recordNativeNavPath(entry);
}

export type ChatBackAction =
  | { kind: "dismiss-keyboard" }
  | { kind: "leave-chat" };

/**
 * Two-step chat back:
 * 1) keyboard up -> dismiss and stay
 * 2) next back -> leave to the previous route
 */
export function resolveChatBackAction(pathname: string): ChatBackAction | null {
  if (!isChatRoutePath(pathname)) return null;

  if (chatBackPhase === "keyboard-dismissed") {
    chatBackPhase = "idle";
    return { kind: "leave-chat" };
  }

  if (isChatKeyboardUp()) {
    dismissChatComposerKeyboard();
    chatBackPhase = "keyboard-dismissed";
    return { kind: "dismiss-keyboard" };
  }

  chatBackPhase = "idle";
  return { kind: "leave-chat" };
}
