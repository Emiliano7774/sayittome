"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { RotateCcw, ShieldAlert } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
import { postAdminAction } from "@/lib/admin/postAdminAction";
import { useT } from "@/contexts/LocaleContext";
import { patchShuffleProfileModerationTag } from "@/lib/shuffle/shuffleSlotsStore";

type ProfileRef = {
  uid: string;
  username: string;
  moderationTag?: string;
};

type Props = {
  profile: ProfileRef;
  variant?: "classic" | "modern";
  appearance?: "profile" | "shuffle";
  className?: string;
  onTagChange?: (moderationTag: string) => void;
};

export function dispatchProfileModerationTag(uid: string, moderationTag: string) {
  patchShuffleProfileModerationTag(uid, moderationTag);
  window.dispatchEvent(
    new CustomEvent("sayittome:shuffle-profile-moderation", {
      detail: { uid, moderationTag },
    }),
  );
}

export default function AdminProfileRoleplayButton({
  profile,
  variant = "classic",
  appearance = "profile",
  className = "",
  onTagChange,
}: Props) {
  const t = useT();
  const { ready, isAdmin, email } = useAdminSession();
  const [tag, setTag] = useState(profile.moderationTag || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTag(profile.moderationTag || "");
  }, [profile.moderationTag, profile.uid]);

  if (!ready || !isAdmin) return null;

  const isRoleplay = tag === "roleplay";
  const modern = variant === "modern";
  const isShuffle = appearance === "shuffle";

  async function runAction(action: "tag_roleplay" | "clear_moderation_tag") {
    if (!profile.uid || busy) return;

    setBusy(true);
    try {
      const json = await postAdminAction(email, {
        action,
        uid: profile.uid,
        note:
          action === "tag_roleplay"
            ? isShuffle
              ? "Marcado como perfil de rol desde Shuffle."
              : "Marcado como perfil de rol desde el perfil público."
            : undefined,
      });

      if (!json?.ok) {
        alert(t("admin_undo_fail"));
        return;
      }

      const nextTag = action === "tag_roleplay" ? "roleplay" : "";
      setTag(nextTag);
      dispatchProfileModerationTag(profile.uid, nextTag);
      onTagChange?.(nextTag);
    } finally {
      setBusy(false);
    }
  }

  function stopBubble(event: SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function toggleShuffleTag() {
    void runAction(isRoleplay ? "clear_moderation_tag" : "tag_roleplay");
  }

  const shuffleShellClass = [
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border backdrop-blur-sm transition active:scale-95 disabled:opacity-50",
    isRoleplay
      ? "border-sky-400/45 bg-sky-500/15 text-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.22)]"
      : modern
        ? "border-amber-400/35 bg-black/65 text-amber-100"
        : "border-amber-400/35 bg-amber-500/15 text-amber-100",
    className,
  ].join(" ");

  const profileShellClass = [
    "inline-flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-sm transition active:scale-95 disabled:opacity-50",
    modern
      ? "border-fuchsia-400/30 bg-black/65 text-fuchsia-200"
      : "border-amber-400/35 bg-black/60 text-amber-100",
    className,
  ].join(" ");

  if (isShuffle) {
    return (
      <div
        className="pointer-events-auto shrink-0"
        onClick={stopBubble}
        onPointerDown={stopBubble}
      >
        <button
          type="button"
          disabled={busy}
          onClick={toggleShuffleTag}
          className={shuffleShellClass}
          title={
            isRoleplay ? t("admin_undo_clear_roleplay_tag") : t("admin_report_tag_roleplay")
          }
          aria-label={
            isRoleplay ? t("admin_undo_clear_roleplay_tag") : t("admin_report_tag_roleplay")
          }
          aria-pressed={isRoleplay}
        >
          <ShieldAlert size={15} strokeWidth={2.2} />
        </button>
      </div>
    );
  }

  if (isRoleplay) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void runAction("clear_moderation_tag")}
        className={profileShellClass}
        title={t("admin_undo_clear_roleplay_tag")}
        aria-label={t("admin_undo_clear_roleplay_tag")}
      >
        <RotateCcw size={14} strokeWidth={2.2} />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void runAction("tag_roleplay")}
      className={profileShellClass}
      title={t("admin_report_tag_roleplay")}
      aria-label={t("admin_report_tag_roleplay")}
    >
      <ShieldAlert size={14} strokeWidth={2.2} />
    </button>
  );
}
