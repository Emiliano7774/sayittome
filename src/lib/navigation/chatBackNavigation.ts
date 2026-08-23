import { isChatKeyboardOpen } from "@/lib/chat/chatComposerViewport";
import { recordNativeNavPath } from "@/lib/navigation/nativeNavStack";

const CHAT_COMPOSER_SELECTOR = "[data-sayittome-chat-composer]";

export type ChatBackPhase = "idle" | "keyboard-dismissed";

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

export function isVisualViewportKeyboardOpen(
  win: Pick<Window, "innerHeight" | "visualViewport"> | null | undefined =
    typeof window === "undefined" ? undefined : window,
) {
  if (!win) return false;
  const viewport = win.visualViewport;
  if (!viewport) return false;
  if (
    isChatKeyboardOpen({
      innerHeight: win.innerHeight,
      visualViewportHeight: viewport.height,
    })
  ) {
    return true;
  }
  return viewport.height < win.innerHeight * 0.86;
}

export function isChatKeyboardUp(
  win: Pick<Window, "innerHeight" | "visualViewport"> | null | undefined =
    typeof window === "undefined" ? undefined : window,
) {
  return isChatComposerFocused() || isVisualViewportKeyboardOpen(win);
}

export type ChatBackDecision = {
  action: ChatBackAction | null;
  nextPhase: ChatBackPhase;
};

/** Pure sequence: keyboard-up → dismiss; next back → leave. */
export function resolveChatBackDecision(input: {
  pathname: string;
  phase: ChatBackPhase;
  keyboardUp: boolean;
}): ChatBackDecision {
  if (!isChatRoutePath(input.pathname)) {
    return { action: null, nextPhase: "idle" };
  }
  if (input.phase === "keyboard-dismissed") {
    return { action: { kind: "leave-chat" }, nextPhase: "idle" };
  }
  if (input.keyboardUp) {
    return { action: { kind: "dismiss-keyboard" }, nextPhase: "keyboard-dismissed" };
  }
  return { action: { kind: "leave-chat" }, nextPhase: "idle" };
}

export function peekChatBackPhase() {
  return chatBackPhase;
}

export function setChatBackPhaseForTests(phase: ChatBackPhase) {
  chatBackPhase = phase;
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
  const decided = resolveChatBackDecision({
    pathname,
    phase: chatBackPhase,
    keyboardUp: isChatKeyboardUp(),
  });
  chatBackPhase = decided.nextPhase;
  if (decided.action?.kind === "dismiss-keyboard") {
    dismissChatComposerKeyboard();
  }
  return decided.action;
}
