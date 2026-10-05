"use client";

import { CircleAlert, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/contexts/LocaleContext";
import {
  getGlobalStoryNotifPrefs,
  getStoryNotifPrefsVersion,
  listenStoryNotifPrefs,
  setGlobalStoryNotifChannel,
  subscribeStoryNotifPrefs,
} from "@/lib/stories/storyNotificationPrefs";
import type { StoryNotifChannel } from "@/lib/stories/storyNotificationPolicy";

type Props = {
  mode?: "global";
};

function ToggleRow({
  label,
  hint,
  enabled,
  onChange,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-story-notif-toggle={label}
      onClick={() => onChange(!enabled)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
    >
      <span>
        <span className="block text-sm font-black text-white">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-white/45">{hint}</span>
      </span>
      <span
        className={[
          "shrink-0 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide",
          enabled ? "bg-[#E879F9]/20 text-[#E879F9]" : "bg-white/10 text-white/45",
        ].join(" ")}
      >
        {enabled ? "ON" : "OFF"}
      </span>
    </button>
  );
}

export default function StoryNotificationSettings(_props: Props) {
  const t = useT();
  const { firebaseUser } = useAuth();
  const [explainOpen, setExplainOpen] = useState(false);
  useSyncExternalStore(subscribeStoryNotifPrefs, getStoryNotifPrefsVersion, () => 0);
  const prefs = getGlobalStoryNotifPrefs();

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    return listenStoryNotifPrefs(uid);
  }, [firebaseUser?.uid]);

  function setChannel(channel: StoryNotifChannel, enabled: boolean) {
    void setGlobalStoryNotifChannel(channel, enabled);
  }

  return (
    <div className="space-y-3" data-story-notification-settings="global">
      <div>
        <p className="text-sm font-black text-white">{t("story_notifications_label")}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-white/45">
          {t("story_notifications_hint")}
        </p>
      </div>
      <ToggleRow
        label={t("story_notifications_likes")}
        hint={t("story_notifications_likes_hint")}
        enabled={prefs.likes}
        onChange={(next) => setChannel("likes", next)}
      />
      <ToggleRow
        label={t("story_notifications_uploads")}
        hint={t("story_notifications_uploads_hint")}
        enabled={prefs.followingUploads}
        onChange={(next) => setChannel("followingUploads", next)}
      />
      <button
        type="button"
        data-story-notif-explain="1"
        onClick={() => setExplainOpen(true)}
        className="flex w-full items-center gap-2 rounded-2xl px-1 py-1 text-left text-[12px] font-semibold text-white/55"
      >
        <CircleAlert size={16} className="shrink-0 text-amber-200" />
        <span>{t("story_notifications_explain")}</span>
      </button>
      {explainOpen ? (
        <div className="fixed inset-0 z-[1000003] flex items-center justify-center bg-black/80 px-4">
          <section
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-[1.5rem] border border-white/10 bg-zinc-950 p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-base font-black text-white">{t("story_notifications_explain_title")}</p>
              <button
                type="button"
                onClick={() => setExplainOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"
                aria-label={t("common_cancel")}
              >
                <X size={16} />
              </button>
            </div>
            <p className="whitespace-pre-line text-sm font-semibold leading-6 text-white/75">
              {t("story_notifications_mad")}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
