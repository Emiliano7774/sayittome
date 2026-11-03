/** Remove only the old, same-origin, full-viewport frames injected at HTML
 * root by retired advertising scripts. Such frames were confirmed to block
 * actual Android Chrome touch events (0px vs 190px with pointer disabled).
 * Legitimate embedded media, Firebase's offscreen auth iframe, and external
 * iframe content are left untouched.
 */
export function clearFullscreenTouchBlockingFrames(doc: Document): number {
  const win = doc.defaultView;
  if (!win) return 0;

  let removed = 0;
  for (const child of Array.from(doc.documentElement.children)) {
    if (child.tagName !== "IFRAME") continue;
    const frame = child as HTMLIFrameElement;
    try {
      const source = new URL(frame.src, win.location.href);
      if (source.origin !== win.location.origin) continue;
      const style = win.getComputedStyle(frame);
      if (style.position !== "fixed" || Number(style.zIndex) < 1_000_000_000) continue;
      const bounds = frame.getBoundingClientRect();
      if (bounds.width < win.innerWidth * 0.8 || bounds.height < win.innerHeight * 0.8) continue;
      frame.remove();
      removed += 1;
    } catch {
      // Never interrupt UI hydration because of an invalid/foreign frame URL.
    }
  }
  return removed;
}
