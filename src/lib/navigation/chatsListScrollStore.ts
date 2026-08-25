/**
 * Capture / restore chats inbox scroll (and optional chat row anchor).
 * Survives keep-alive freeze where overflow:hidden would otherwise lose mid-list position.
 */

export type ChatsListScrollAnchor = {
  scrollY: number;
  chatId: string;
  rowOffsetTop?: number;
  savedAt: number;
};

let anchor: ChatsListScrollAnchor | null = null;

export function captureChatsListScroll(chatId: string) {
  if (typeof window === "undefined") return;
  const id = String(chatId || "").trim();
  if (!id) return;

  let rowOffsetTop: number | undefined;
  const row = document.querySelectorAll<HTMLElement>("[data-nav-chat-row][data-chat-id]");
  for (const candidate of row) {
    if (candidate.getAttribute("data-chat-id") === id) {
      const rect = candidate.getBoundingClientRect();
      rowOffsetTop = Math.round(rect.top + window.scrollY);
      break;
    }
  }

  anchor = {
    scrollY: Math.max(0, Math.round(window.scrollY)),
    chatId: id,
    rowOffsetTop,
    savedAt: Date.now(),
  };
}

export function peekChatsListScroll(): ChatsListScrollAnchor | null {
  return anchor;
}

export function consumeChatsListScroll(): ChatsListScrollAnchor | null {
  const next = anchor;
  anchor = null;
  return next;
}

export function restoreChatsListScroll(saved?: ChatsListScrollAnchor | null) {
  if (typeof window === "undefined") return false;
  const target = saved === undefined ? consumeChatsListScroll() : saved;
  if (!target) return false;

  const apply = () => {
    if (typeof target.rowOffsetTop === "number" && Number.isFinite(target.rowOffsetTop)) {
      window.scrollTo(0, Math.max(0, target.rowOffsetTop - 72));
    } else {
      window.scrollTo(0, target.scrollY);
    }

    const rows = document.querySelectorAll<HTMLElement>("[data-nav-chat-row][data-chat-id]");
    for (const row of rows) {
      if (row.getAttribute("data-chat-id") === target.chatId) {
        row.scrollIntoView({ block: "center", inline: "nearest" });
        break;
      }
    }
  };

  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  return true;
}
