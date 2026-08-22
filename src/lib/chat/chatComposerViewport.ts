/**
 * Web + native chat composer inset: visualViewport + safe-area + browser chrome.
 * Keyboard open/close must keep text/audio/camera above the bottom edge.
 * Native shell already pads safe-area on html/body — do not double it.
 */

export type ChatComposerViewportInput = {
  innerHeight: number;
  visualViewport?: {
    height: number;
    offsetTop: number;
    offsetLeft?: number;
  } | null;
  safeAreaBottom: number;
  isNativeShell: boolean;
  keyboardOpen?: boolean;
};

export type ChatComposerViewportResult = {
  shellHeight: number;
  shellOffsetTop: number;
  composerPadPx: number;
  chromeBottomPx: number;
  keyboardOpen: boolean;
  doubleNativeSafeArea: false;
  visibleBottom: number;
  composerBottom: number;
};

/** Safe-area overlay still inside the visual viewport. Chrome already clipped by vv must not be added again. */
export const WEB_COMPOSER_PAD_CAP = 48;

export function isChatKeyboardOpen(input: {
  innerHeight: number;
  visualViewportHeight?: number;
}) {
  const vv = input.visualViewportHeight ?? input.innerHeight;
  return input.innerHeight - vv > 220;
}

export function readBrowserChromeBottom(input: {
  innerHeight: number;
  visualViewport?: { height: number; offsetTop: number } | null;
}) {
  const viewport = input.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round(input.innerHeight - viewport.height - viewport.offsetTop));
}

export function computeChatComposerViewport(
  input: ChatComposerViewportInput,
): ChatComposerViewportResult {
  const viewport = input.visualViewport;
  const shellHeight = Math.round(viewport?.height || input.innerHeight);
  const shellOffsetTop = Math.round(viewport?.offsetTop || 0);
  const chromeBottomPx = readBrowserChromeBottom({
    innerHeight: input.innerHeight,
    visualViewport: viewport,
  });
  const keyboardOpen =
    input.keyboardOpen ??
    isChatKeyboardOpen({
      innerHeight: input.innerHeight,
      visualViewportHeight: viewport?.height,
    });

  // Shell is already sized to visualViewport.height. Chrome outside that box
  // (innerHeight - vv.height - offsetTop) is already clipped — do not add it again.
  let composerPadPx = 12;
  if (input.isNativeShell || keyboardOpen) {
    composerPadPx = 12;
  } else {
    const overlayInsideVv = Math.max(0, Math.round(input.safeAreaBottom));
    composerPadPx = Math.max(12, Math.min(WEB_COMPOSER_PAD_CAP, overlayInsideVv));
  }

  const visibleBottom = shellOffsetTop + shellHeight;
  return {
    shellHeight,
    shellOffsetTop,
    composerPadPx,
    chromeBottomPx,
    keyboardOpen,
    doubleNativeSafeArea: false,
    visibleBottom,
    composerBottom: visibleBottom,
  };
}

export function isComposerWithinVisibleViewport(inset: ChatComposerViewportResult) {
  return inset.composerBottom <= inset.visibleBottom;
}

export function applyChatComposerViewportVars(
  doc: Pick<Document, "documentElement"> | null | undefined,
  inset: ChatComposerViewportResult,
) {
  if (!doc?.documentElement?.style) return inset;
  const style = doc.documentElement.style;
  style.setProperty("--sayittome-chat-vvh", `${inset.shellHeight}px`);
  style.setProperty("--sayittome-chat-vv-offset-top", `${inset.shellOffsetTop}px`);
  style.setProperty("--sayittome-chat-composer-pad", `${inset.composerPadPx}px`);
  return inset;
}
