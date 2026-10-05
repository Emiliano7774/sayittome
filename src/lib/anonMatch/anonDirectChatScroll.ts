/** Pin the express anon chat list to the latest message. Never scroll the page behind it. */
export function pinAnonChatScroll(scroller: HTMLElement | null) {
  if (!scroller) return;
  scroller.scrollTop = scroller.scrollHeight;
}

/** Pixels the on-screen keyboard covers at the bottom of the layout viewport. */
export function readKeyboardOverlapPx() {
  if (typeof window === "undefined") return 0;
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
}
