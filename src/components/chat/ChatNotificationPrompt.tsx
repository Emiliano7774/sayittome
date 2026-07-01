"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";

import { useT } from "@/contexts/LocaleContext";
import {
  completeChatNotificationPrompt,
  getChatNotificationPrefs,
} from "@/lib/chat/chatNotificationPrefs";
import { requestChatNotificationPermission } from "@/lib/chat/chatNotifications";

export default function ChatNotificationPrompt() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const prefs = getChatNotificationPrefs();
    if (!prefs.prompted) {
      setOpen(true);
    }
  }, []);

  async function choose(enabled: boolean) {
    completeChatNotificationPrompt(enabled);
    setOpen(false);

    if (enabled) {
      await requestChatNotificationPermission();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-notification-prompt-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-violet-500/35 bg-[#07070B] p-6 shadow-[0_16px_34px_rgba(108,99,255,0.22)]">
        <div className="flex items-start gap-3">
          <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5D5FEF] to-[#8C84FF]">
            <Bell size={21} className="text-white" />
          </div>
          <div>
            <h2 id="chat-notification-prompt-title" className="text-[22px] font-black text-white">
              {t("chat_notifications_prompt_title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              {t("chat_notifications_prompt_body")}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => void choose(true)}
            className="w-full rounded-[18px] bg-[#6C63FF] py-3.5 text-sm font-black text-white"
          >
            {t("chat_notifications_prompt_yes")}
          </button>
          <button
            type="button"
            onClick={() => void choose(false)}
            className="w-full rounded-[18px] border border-white/10 bg-white/[0.055] py-3.5 text-sm font-extrabold text-white/80"
          >
            {t("chat_notifications_prompt_no")}
          </button>
        </div>
      </div>
    </div>
  );
}
