import type { MessageKey } from "@/lib/i18n/getMessage";
import type { InboxChat } from "@/hooks/useChatsInbox";

type Translator = (key: MessageKey, values?: Record<string, string>) => string;

export function formatRelativeInboxTime(ms: number, t: Translator) {
  if (!ms) return "";

  const diffMinutes = Math.floor((Date.now() - ms) / 60_000);

  if (diffMinutes < 1) {
    return t("chats_inbox_minutes", { minutes: "1" });
  }

  if (diffMinutes < 60) {
    return t("chats_inbox_minutes", { minutes: String(diffMinutes) });
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return t("chats_inbox_hours", { hours: String(diffHours) });
  }

  const diffDays = Math.floor(diffHours / 24);
  return t("chats_inbox_days", { days: String(diffDays) });
}

export function formatClassicInboxTime(
  chat: InboxChat,
  viewerId: string,
  t: Translator,
) {
  const ms = chat.updatedAt?.toMillis?.() ?? 0;
  if (!ms) return "";

  const time = formatRelativeInboxTime(ms, t);
  const sender = chat.lastMessageSender || "";
  const readBy = chat.readBy || {};

  if (sender && sender === viewerId) {
    const otherRead = Object.entries(readBy).some(
      ([key, value]) => key !== viewerId && value === true,
    );

    return otherRead ? t("chats_inbox_seen", { time }) : t("chats_inbox_sent", { time });
  }

  return time;
}
