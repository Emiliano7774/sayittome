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

/**
 * Each tab keeps its own sessionStorage copy of the open chat, so closing one
 * leaves the others showing a chat that no longer exists. Announce the close so
 * every tab drops it at once instead of waiting for a Firestore round trip.
 */
const CLOSE_CHANNEL = "sayittome:anon-direct-chat-closed";

export function broadcastAnonDirectChatClosed(chatId: string) {
  if (typeof window === "undefined" || !chatId) return;

  const payload = JSON.stringify({ chatId, at: Date.now() });

  try {
    const channel = new BroadcastChannel(CLOSE_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // Fall through to the storage event below.
  }

  try {
    // Storage events only fire in other tabs, which is exactly the audience here.
    localStorage.setItem(CLOSE_CHANNEL, payload);
  } catch {
    // Ignore quota errors.
  }
}

export function subscribeAnonDirectChatClosed(onClosed: (chatId: string) => void) {
  if (typeof window === "undefined") return () => {};

  const handlePayload = (raw: unknown) => {
    try {
      const chatId = String(JSON.parse(String(raw || "")).chatId || "");
      if (chatId) onClosed(chatId);
    } catch {
      // Ignore malformed payloads.
    }
  };

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CLOSE_CHANNEL);
    channel.onmessage = (event) => handlePayload(event.data);
  } catch {
    channel = null;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== CLOSE_CHANNEL) return;
    handlePayload(event.newValue);
  };
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}
