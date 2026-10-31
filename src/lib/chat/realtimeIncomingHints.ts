/** Reuse message data ALREADY delivered by existing listeners/pushes.
 * No extra Firestore queries or subscriptions are created here. */
export const CHAT_LIVE_TAIL_HINT_EVENT = "sayittome:chat-live-tail-hint";
export const ANON_DIRECT_PUSH_HINT_EVENT = "sayittome:anon-direct-push-hint";

export type LiveTailHint = {
  chatId: string;
  messageId: string;
  data: Record<string, unknown>;
};

export type DirectPushHint = {
  chatId: string;
  messageId: string;
  body: string;
  receivedAt: number;
};

export function publishLiveTailHint(hint: LiveTailHint) {
  if (typeof window === "undefined" || !hint.chatId || !hint.messageId) return;
  window.dispatchEvent(new CustomEvent<LiveTailHint>(CHAT_LIVE_TAIL_HINT_EVENT, { detail: hint }));
}

export function publishAnonDirectPushHint(input: Omit<DirectPushHint, "receivedAt">) {
  if (typeof window === "undefined") return;
  const chatId = String(input.chatId || "").trim();
  const messageId = String(input.messageId || "").trim();
  const body = String(input.body || "").trim().slice(0, 240);
  if (!chatId || !messageId || !body) return;
  window.dispatchEvent(new CustomEvent<DirectPushHint>(ANON_DIRECT_PUSH_HINT_EVENT, {
    detail: { chatId, messageId, body, receivedAt: Date.now() },
  }));
}
