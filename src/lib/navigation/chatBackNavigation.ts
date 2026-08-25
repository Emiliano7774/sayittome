import { isChatKeyboardOpen } from "@/lib/chat/chatComposerViewport";
import { recordNativeNavPath } from "@/lib/navigation/nativeNavStack";

const CHAT_COMPOSER_SELECTOR = "[data-sayittome-chat-composer]";

export type ChatBackPhase = "idle" | "keyboard-dismissed";

let chatBackPhase: ChatBackPhase = "idle";
/** After hardware/UI dismiss, suppress autofocus until the user taps the composer. */
let imeDismissLatch = false;

function normalizePath(pathname: string) {
  const path = String(pathname || "/").split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

export function resetChatBackNavigationState() {
  chatBackPhase = "idle";
  imeDismissLatch = false;
}

export function armChatImeDismissLatch() {
  imeDismissLatch = true;
}

export function clearChatImeDismissLatch() {
  imeDismissLatch = false;
}

export function isChatImeDismissLatched() {
  return imeDismissLatch;
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
  /** True when the composer still owns focus (user reopened IME after a dismiss). */
  composerFocused?: boolean;
}): ChatBackDecision {
  if (!isChatRoutePath(input.pathname)) {
    return { action: null, nextPhase: "idle" };
  }

  if (input.keyboardUp) {
    // After dismiss, Android may still report a raised viewport for one press.
    // If the composer is focused again, treat it as a fresh IME session.
    if (input.phase === "keyboard-dismissed" && input.composerFocused) {
      return { action: { kind: "dismiss-keyboard" }, nextPhase: "keyboard-dismissed" };
    }
    if (input.phase === "keyboard-dismissed") {
      return { action: { kind: "leave-chat" }, nextPhase: "idle" };
    }
    return { action: { kind: "dismiss-keyboard" }, nextPhase: "keyboard-dismissed" };
  }

  if (input.phase === "keyboard-dismissed") {
    return { action: { kind: "leave-chat" }, nextPhase: "idle" };
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
    composerFocused: isChatComposerFocused(),
  });
  chatBackPhase = decided.nextPhase;
  if (decided.action?.kind === "dismiss-keyboard") {
    armChatImeDismissLatch();
    dismissChatComposerKeyboard();
  }
  return decided.action;
}

/** Call when the composer regains focus so a later back dismisses IME again. */
export function noteChatComposerFocused() {
  clearChatImeDismissLatch();
  if (chatBackPhase === "keyboard-dismissed") {
    chatBackPhase = "idle";
  }
}
