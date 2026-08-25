/**
 * Admin chat history list position (scroll + selection) per username.
 */

export type AdminHistoryListAnchor = {
  username: string;
  scrollTop: number;
  selectedChatId: string;
  savedAt: number;
};

const byUsername = new Map<string, AdminHistoryListAnchor>();

function keyOf(username: string) {
  return String(username || "").trim().toLowerCase();
}

export function captureAdminHistoryListScroll(input: {
  username: string;
  scrollTop: number;
  selectedChatId?: string;
}) {
  const key = keyOf(input.username);
  if (!key) return;
  byUsername.set(key, {
    username: key,
    scrollTop: Math.max(0, Math.round(Number(input.scrollTop) || 0)),
    selectedChatId: String(input.selectedChatId || "").trim(),
    savedAt: Date.now(),
  });
}

export function peekAdminHistoryListScroll(username: string): AdminHistoryListAnchor | null {
  return byUsername.get(keyOf(username)) || null;
}

export function restoreAdminHistoryListScroll(
  scroller: HTMLElement | null,
  username: string,
): boolean {
  if (!scroller) return false;
  const saved = peekAdminHistoryListScroll(username);
  if (!saved) return false;
  const apply = () => {
    scroller.scrollTop = saved.scrollTop;
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  return true;
}
