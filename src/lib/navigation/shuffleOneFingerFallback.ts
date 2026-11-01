/**
 * Native scrolling owns Shuffle. Rescue a vertical drag only if scrollTop has
 * stopped advancing while touchmove events continue. Never install a blocking
 * (non-passive) listener: that puts every Android scroll frame behind JS work.
 */
type Gesture = {
  id: number;
  startX: number;
  startY: number;
  previousY: number;
  previousScrollTop: number;
  lastNativeMoveAt: number;
  nextNativeSampleAt: number;
  rescuing: boolean;
  root: HTMLElement;
};

function hasNestedVerticalScroller(target: Element, root: HTMLElement) {
  let node: Element | null = target;
  while (node && node !== root) {
    if (node.matches('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return true;
    if (node instanceof HTMLElement) {
      const overflow = getComputedStyle(node).overflowY;
      if (/auto|scroll/.test(overflow) && node.scrollHeight > node.clientHeight + 12) return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function installShuffleOneFingerFallback(host: HTMLElement) {
  let gesture: Gesture | null = null;

  const onStart = (event: TouchEvent) => {
    gesture = null;
    if (event.touches.length !== 1) return;
    if (!host.classList.contains("sayittome-shuffle-keepalive-visible")) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const root = target.closest<HTMLElement>("main[data-scroll-root]");
    if (!root || !host.contains(root) || hasNestedVerticalScroller(target, root)) return;
    if (root.scrollHeight <= root.clientHeight + 48) return;
    const touch = event.touches[0];
    gesture = {
      id: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      previousY: touch.clientY,
      previousScrollTop: root.scrollTop,
      lastNativeMoveAt: performance.now(),
      nextNativeSampleAt: 0,
      rescuing: false,
      root,
    };
  };

  const onMove = (event: TouchEvent) => {
    const active = gesture;
    if (!active) return;
    if (event.touches.length !== 1) { gesture = null; return; }
    const touch = event.touches[0];
    if (touch.identifier !== active.id) { gesture = null; return; }

    const dy = active.previousY - touch.clientY;
    const totalY = active.startY - touch.clientY;
    const totalX = touch.clientX - active.startX;
    active.previousY = touch.clientY;
    if (Math.abs(totalX) > Math.abs(totalY) * 0.9) {
      gesture = null;
      return;
    }

    const root = active.root;
    if (!root.isConnected || !host.classList.contains("sayittome-shuffle-keepalive-visible")) {
      gesture = null;
      return;
    }

    const now = performance.now();
    // Chromium may have to synchronize compositor scroll position to answer
    // scrollTop. Never force that read on every Android touchmove while native
    // scrolling is healthy. Keep full touchmove resolution only during rescue.
    if (!active.rescuing && now < active.nextNativeSampleAt) return;
    active.nextNativeSampleAt = now + 48;
    const observed = root.scrollTop;
    // Motion not caused by our rescue belongs to the native compositor.
    if (Math.abs(observed - active.previousScrollTop) > 2) {
      active.lastNativeMoveAt = now;
      active.rescuing = false;
    }
    active.previousScrollTop = observed;

    // Wait for normal native panning. If Android goes idle in the middle of a
    // drag, unstick the feed using incremental delta, not a jump to startY.
    const nativeStalled = now - active.lastNativeMoveAt >= 130;
    const intentionalVertical = Math.abs(totalY) > 48 && Math.abs(dy) > 1.5;
    if (!nativeStalled || !intentionalVertical) return;
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    if ((dy > 0 && observed >= max - 1) || (dy < 0 && observed <= 1)) return;

    // Passive rescue. No preventDefault: Chromium must retain compositor-native
    // touch scrolling even if the main JavaScript thread becomes busy.
    root.scrollTop = Math.max(0, Math.min(max, observed + dy));
    active.previousScrollTop = root.scrollTop;
    active.rescuing = true;
    active.nextNativeSampleAt = now;
  };

  const onEnd = () => { gesture = null; };
  host.addEventListener("touchstart", onStart, { passive: true, capture: true });
  host.addEventListener("touchmove", onMove, { passive: true, capture: true });
  host.addEventListener("touchend", onEnd, { passive: true, capture: true });
  host.addEventListener("touchcancel", onEnd, { passive: true, capture: true });
  return () => {
    host.removeEventListener("touchstart", onStart, true);
    host.removeEventListener("touchmove", onMove, true);
    host.removeEventListener("touchend", onEnd, true);
    host.removeEventListener("touchcancel", onEnd, true);
  };
}
