const SESSION_CHATS_KEY = "sayittome_session_chats";

export function getSessionChatIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = sessionStorage.getItem(SESSION_CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === "string" && id.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function registerSessionChat(chatId: string) {
  if (typeof window === "undefined" || !chatId) return;

  const current = getSessionChatIds();
  if (current.includes(chatId)) return;

  try {
    sessionStorage.setItem(
      SESSION_CHATS_KEY,
      JSON.stringify([chatId, ...current].slice(0, 40)),
    );
  } catch {}
}

export function clearSessionChats() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_CHATS_KEY);
}
