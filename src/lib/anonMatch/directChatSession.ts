import type { AnonMatchConnectPhase } from "@/contexts/AnonMatchContext";

export type AnonDirectChatView = "compact" | "expanded" | "minimized";

export type PersistedAnonDirectChat = {
  chatId: string;
  role: "perfil" | "anonimo";
  closedReason?: "cerrado" | "denunciado" | "peer_closed";
};

export type AnonDirectChatSession = {
  openChat: PersistedAnonDirectChat;
  chatView: AnonDirectChatView;
  phase: AnonMatchConnectPhase;
  savedAt: number;
};

const STORAGE_KEY = "sayittome_anon_direct_chat_v1";

export function loadAnonDirectChatSession(): AnonDirectChatSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnonDirectChatSession;
    if (!parsed?.openChat?.chatId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAnonDirectChatSession(session: AnonDirectChatSession) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore quota errors.
  }
}

export function clearAnonDirectChatSession() {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
