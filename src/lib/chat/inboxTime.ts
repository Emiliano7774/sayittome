import type { MessageKey } from "@/lib/i18n/getMessage";
import type { InboxChat } from "@/hooks/useChatsInbox";

type Translator = (key: MessageKey, values?: Record<string, string>) => string;

function minutesAgo(ms: number) {
  if (!ms) return 0;
  return Math.max(1, Math.floor((Date.now() - ms) / 60_000));
}

export function formatClassicInboxTime(
  chat: InboxChat,
  viewerId: string,
  t: Translator,
) {
  const ms = chat.updatedAt?.toMillis?.() ?? 0;
  if (!ms) return "";

  const minutes = String(minutesAgo(ms));
  const time = t("chats_inbox_minutes", { minutes });

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
