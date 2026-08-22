/**
 * Productive hide/present contract for Chats→Shuffle and profile back.
 * Never hide the current shell until a real, unfrozen Shuffle snapshot
 * with geometry and feed content is presented. No black placeholder.
 */

export const SHUFFLE_MIN_SHELL_ATTR = "data-sayittome-shuffle-min-shell";

function hasClass(el: Element | null | undefined, name: string) {
  return Boolean(el?.classList?.contains?.(name));
}

function readRect(el: Element | null | undefined) {
  if (!el || typeof el.getBoundingClientRect !== "function") return null;
  try {
    return el.getBoundingClientRect();
  } catch {
    return null;
  }
}

function hasPaintGeometry(el: Element | null | undefined) {
  const rect = readRect(el);
  if (rect) return rect.width >= 8 && rect.height >= 8;
  const node = el as HTMLElement | null;
  if (node && (node.offsetWidth >= 8 || node.offsetHeight >= 8)) return true;
  return Boolean(el && el.childNodes && el.childNodes.length > 0);
}

export function collectShuffleFeedCards(host: Element | null | undefined) {
  if (!host || typeof host.querySelector !== "function") return [] as Element[];
  const list = host.querySelector("[data-shuffle-list]");
  if (list) {
    const children = list.children ? Array.from(list.children) : [];
    return children.filter((node) => {
      const el = node as Element;
      return Boolean(
        el?.classList &&
          !el.classList.contains("sayittome-nav-scroll-spacer") &&
          el.getAttribute?.("data-sayittome-shuffle-min-shell") !== "1",
      );
    });
  }
  return Array.from(
    host.querySelectorAll("[data-shuffle-slot], [data-nav-shuffle-primary] > *"),
  ).filter((node) => node.getAttribute("data-sayittome-shuffle-min-shell") !== "1");
}

export function hasRealShuffleFeedContent(host: Element | null | undefined) {
  if (!host) return false;
  if (
    typeof host.querySelector === "function" &&
    host.querySelector(`[${SHUFFLE_MIN_SHELL_ATTR}='1']`) &&
    collectShuffleFeedCards(host).length === 0
  ) {
    return false;
  }
  const cards = collectShuffleFeedCards(host);
  for (const card of cards) {
    if (hasPaintGeometry(card)) return true;
  }
  return false;
}

export function isRealShuffleSnapshotPresented(host: Element | null | undefined) {
  if (!host) return false;
  if (hasClass(host, "sayittome-shuffle-keepalive-frozen")) return false;
  if (!hasClass(host, "sayittome-shuffle-keepalive-visible")) return false;
  if (host.hasAttribute?.("hidden") || host.hasAttribute?.("inert")) return false;
  if (!hasPaintGeometry(host)) return false;
  try {
    const style =
      typeof window !== "undefined" && typeof window.getComputedStyle === "function"
        ? window.getComputedStyle(host)
        : null;
    if (style) {
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (Number(style.opacity || "1") < 0.05) return false;
    }
  } catch {
    /* ignore */
  }
  return hasRealShuffleFeedContent(host);
}

/** Current chats/profile shell stays painted until this is true. */
export function canHideCurrentShellForShuffle(host: Element | null | undefined) {
  return isRealShuffleSnapshotPresented(host);
}

export function planChatsToShuffleReveal(input: {
  host: Element | null | undefined;
  hop?: number;
}) {
  const presented = isRealShuffleSnapshotPresented(input.host);
  return {
    hop: input.hop ?? 1,
    hideCurrentShell: presented,
    presentHost: presented,
    remount: false as const,
    allowBlackPlaceholder: false as const,
    hostFrozen: hasClass(input.host, "sayittome-shuffle-keepalive-frozen"),
    snapshotPainted: presented,
  };
}
