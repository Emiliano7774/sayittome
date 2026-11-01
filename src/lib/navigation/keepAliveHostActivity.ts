/**
 * Keep-alive panels stay mounted with visibility:hidden + contain:strict.
 * Chromium IntersectionObserver often still reports them as intersecting, so
 * muted <video> preview loops keep decoding and heat the device after the
 * user leaves Shuffle/Stories. Treat frozen host class as "not active".
 */

const HOST_SELECTOR =
  '[id^="sayittome-main-tab-keepalive-"], #sayittome-shuffle-keepalive-host';

export function findKeepAliveHost(node: Element | null): Element | null {
  if (!node) return null;
  return node.closest(HOST_SELECTOR);
}

export function isKeepAliveHostFrozen(host: Element | null): boolean {
  if (!host) return false;
  return (
    host.classList.contains("sayittome-main-tab-keepalive-frozen") ||
    host.classList.contains("sayittome-shuffle-keepalive-frozen")
  );
}

export function isMediaSurfaceHostActive(node: Element | null): boolean {
  const host = findKeepAliveHost(node);
  if (!host) return true;
  return !isKeepAliveHostFrozen(host);
}
