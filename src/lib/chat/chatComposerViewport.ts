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
  overlayInsetPx: number;
  controlRowBottom: number;
};

/** Safe-area overlay still inside the visual viewport. Chrome already clipped by vv must not be added again. */
export const WEB_COMPOSER_PAD_CAP = 48;
/** Home indicator / gesture bar when visualViewport does not shrink (mobile web overlay). */
export const WEB_OVERLAY_FLOOR_PX = 34;

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

export function readComposerOverlayInset(input: {
  chromeBottomPx: number;
  safeAreaBottom: number;
  keyboardOpen: boolean;
  isNativeShell: boolean;
}) {
  if (input.isNativeShell || input.keyboardOpen) return 0;
  const safe = Math.max(0, Math.round(input.safeAreaBottom));
  // vv already reduced: chrome sits outside the shell. Only lift for safe-area
  // still inside that box. Unclipped vv (≈ innerHeight): home/chrome overlays
  // the shell and must be reserved.
  if (input.chromeBottomPx > 8) return safe;
  return Math.max(WEB_OVERLAY_FLOOR_PX, safe);
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

  const overlayInsetPx = readComposerOverlayInset({
    chromeBottomPx,
    safeAreaBottom: input.safeAreaBottom,
    keyboardOpen,
    isNativeShell: input.isNativeShell,
  });

  let composerPadPx = 12;
  if (input.isNativeShell || keyboardOpen) {
    composerPadPx = 12;
  } else {
    composerPadPx = Math.max(12, Math.min(WEB_COMPOSER_PAD_CAP, overlayInsetPx));
  }

  const visibleBottom = shellOffsetTop + shellHeight;
  const controlRowBottom = visibleBottom - composerPadPx;
  return {
    shellHeight,
    shellOffsetTop,
    composerPadPx,
    chromeBottomPx,
    keyboardOpen,
    doubleNativeSafeArea: false,
    visibleBottom,
    composerBottom: controlRowBottom,
    overlayInsetPx,
    controlRowBottom,
  };
}

export function isComposerWithinVisibleViewport(inset: ChatComposerViewportResult) {
  return inset.controlRowBottom <= inset.visibleBottom - inset.overlayInsetPx + 0.5;
}

export function isComposerControlsTouchable(inset: ChatComposerViewportResult) {
  return (
    inset.composerPadPx >= inset.overlayInsetPx &&
    isComposerWithinVisibleViewport(inset)
  );
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
