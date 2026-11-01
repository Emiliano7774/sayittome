/**
 * Composer focus policy for Android WebView / Capacitor chat.
 *
 * Multi-shot focus (immediate + rAF + 0/80/180ms) + visualViewport resize
 * re-focus caused IME open/close thrash on Samsung devices: each focus() can
 * retrigger a viewport resize, which scheduled another focus cascade.
 */

export type ComposerRefocusDecision = {
  /** Call focus() once now. */
  focusNow: boolean;
  /** Why we skipped or focused (for harness / diagnostics). */
  reason:
    | "ime-dismiss-latched"
    | "already-focused"
    | "focus-once"
    | "skip-viewport-resize-refocus";
};

/** Decide whether a programmatic composer focus should run. */
export function decideComposerRefocus(input: {
  imeDismissLatched: boolean;
  alreadyFocused: boolean;
}): ComposerRefocusDecision {
  if (input.imeDismissLatched) {
    return { focusNow: false, reason: "ime-dismiss-latched" };
  }
  if (input.alreadyFocused) {
    return { focusNow: false, reason: "already-focused" };
  }
  return { focusNow: true, reason: "focus-once" };
}

/**
 * visualViewport resize must NEVER re-focus the composer.
 * Layout sync / scroll-to-bottom may still run; focus belongs to the user or
 * an explicit send path that already owns keepComposerFocus.
 */
export function decideComposerRefocusOnViewportResize(): ComposerRefocusDecision {
  return { focusNow: false, reason: "skip-viewport-resize-refocus" };
}

/** Delayed focus cascade ms values that must stay empty (no IME thrash timers). */
export function composerRefocusDelayMs(): readonly number[] {
  return [];
}
