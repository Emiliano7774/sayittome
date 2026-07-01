"use client";

import { useSyncExternalStore } from "react";

import { useT } from "@/contexts/LocaleContext";
import { requestChatNotificationPermission } from "@/lib/chat/chatNotifications";
import {
  areChatNotificationsEnabled,
  getChatNotificationPrefsVersion,
  setChatNotificationsEnabled,
  subscribeChatNotificationPrefs,
} from "@/lib/chat/chatNotificationPrefs";

type Props = {
  variant?: "classic" | "modern";
};

export default function ChatNotificationSetting({ variant = "modern" }: Props) {
  const t = useT();
  const enabled = useSyncExternalStore(
    subscribeChatNotificationPrefs,
    areChatNotificationsEnabled,
    () => false,
  );

  useSyncExternalStore(
    subscribeChatNotificationPrefs,
    getChatNotificationPrefsVersion,
    () => "0-0",
  );

  async function toggleEnabled() {
    const next = !enabled;
    setChatNotificationsEnabled(next);
    if (next) {
      await requestChatNotificationPermission();
    }
  }

  if (variant === "classic") {
    return (
      <div className="border-b border-white/18 pb-8 mb-8">
        <p className="text-white/55 text-sm font-black uppercase tracking-wide mb-4">
          {t("chat_notifications_label")}
        </p>
        <p className="text-white/35">{t("chat_notifications_hint")}</p>
        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={() => void toggleEnabled()}
            className={`px-5 py-3 rounded-full font-black ${
              enabled ? "bg-white text-black" : "bg-white/10 text-white/45"
            }`}
          >
            {enabled ? t("chat_notifications_enabled") : t("chat_notifications_disabled")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="text-sm font-black text-white/70">{t("chat_notifications_label")}</span>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-black px-4 py-3">
        <p className="text-sm text-zinc-400">{t("chat_notifications_hint")}</p>
        <button
          type="button"
          onClick={() => void toggleEnabled()}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${
            enabled ? "bg-violet-500 text-white" : "bg-white/10 text-white/45"
          }`}
        >
          {enabled ? t("chat_notifications_enabled") : t("chat_notifications_disabled")}
        </button>
      </div>
    </label>
  );
}
