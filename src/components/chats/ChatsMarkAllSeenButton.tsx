"use client";

import { useRef, useState } from "react";

import { useT } from "@/contexts/LocaleContext";
import type { InboxChat } from "@/hooks/useChatsInbox";
import { totalUnreadCount } from "@/lib/chat/inboxUnread";
import { markAllPendingChatsAsRead } from "@/lib/chat/unread";

type Props = {
  chats: InboxChat[];
  uid: string;
  className?: string;
};

export default function ChatsMarkAllSeenButton({
  chats,
  uid,
  className = "",
}: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const inflightRef = useRef(false);
  const pendingCount = totalUnreadCount(chats, uid);

  async function onMarkAllSeen() {
    if (inflightRef.current || busy) return;
    if (pendingCount <= 0) {
      setHint(t("chats_mark_all_seen_done"));
      return;
    }

    inflightRef.current = true;
    setBusy(true);
    setHint("");
    try {
      const result = await markAllPendingChatsAsRead(chats, uid);
      if (result.failed > 0) {
        setHint(
          t("chats_mark_all_seen_partial", { failed: String(result.failed) }),
        );
      } else {
        setHint(t("chats_mark_all_seen_done"));
      }
    } catch {
      setHint(t("chats_mark_all_seen_partial", { failed: "?" }));
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          void onMarkAllSeen();
        }}
        disabled={chats.length === 0 || busy}
        className={className}
        data-chats-mark-all-seen="1"
      >
        {busy ? t("common_loading") : t("chats_mark_all_seen")}
      </button>
      {hint ? (
        <p className="max-w-[12rem] text-right text-[10px] font-semibold text-white/45" data-chats-mark-all-seen-hint="1">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
