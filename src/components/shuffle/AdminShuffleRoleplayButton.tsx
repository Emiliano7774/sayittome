"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { ShieldAlert } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
import { postAdminAction } from "@/lib/admin/postAdminAction";
import { useT } from "@/contexts/LocaleContext";
import { patchShuffleProfileModerationTag } from "@/lib/shuffle/shuffleSlotsStore";
import type { ShuffleProfile } from "@/lib/shuffle/types";

type Props = {
  profile: Pick<ShuffleProfile, "uid" | "username" | "moderationTag">;
  variant?: "classic" | "modern";
  className?: string;
};

export function dispatchShuffleProfileModeration(
  uid: string,
  moderationTag: string,
) {
  patchShuffleProfileModerationTag(uid, moderationTag);
  window.dispatchEvent(
    new CustomEvent("sayittome:shuffle-profile-moderation", {
      detail: { uid, moderationTag },
    }),
  );
}

export default function AdminShuffleRoleplayButton({
  profile,
  variant = "classic",
  className = "",
}: Props) {
  const t = useT();
  const { ready, email, isAdmin } = useAdminSession();
  const [tag, setTag] = useState(profile.moderationTag || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTag(profile.moderationTag || "");
  }, [profile.moderationTag, profile.uid]);

  if (!ready || !isAdmin) return null;

  const isRoleplay = tag === "roleplay";

  async function runAction(action: "tag_roleplay" | "clear_moderation_tag") {
    if (!profile.uid || busy) return;

    setBusy(true);
    try {
      const json = await postAdminAction(email, {
        action,
        uid: profile.uid,
        note:
          action === "tag_roleplay"
            ? "Marcado como perfil de rol desde Shuffle."
            : undefined,
      });

      if (!json?.ok) {
        alert(t("admin_undo_fail"));
        return;
      }

      const nextTag = action === "tag_roleplay" ? "roleplay" : "";
      setTag(nextTag);
      dispatchShuffleProfileModeration(profile.uid, nextTag);
    } finally {
      setBusy(false);
    }
  }

  function stopBubble(event: SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  const modern = variant === "modern";

  if (isRoleplay) {
    return (
      <div
        className={["pointer-events-auto shrink-0", className].join(" ")}
        onClick={stopBubble}
        onPointerDown={stopBubble}
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction("clear_moderation_tag")}
          className={[
            "font-black text-sky-200 transition active:scale-95 disabled:opacity-50",
            modern
              ? "rounded-full border border-sky-400/30 bg-black/65 px-2.5 py-1 text-[10px] backdrop-blur-sm"
              : "rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-xs",
          ].join(" ")}
        >
          {t("admin_undo_clear_roleplay_tag")}
        </button>
      </div>
    );
  }

  return (
    <div
      className={["pointer-events-auto shrink-0", className].join(" ")}
      onClick={stopBubble}
      onPointerDown={stopBubble}
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => void runAction("tag_roleplay")}
        className={[
          "inline-flex items-center gap-1.5 font-black text-amber-100 transition active:scale-95 disabled:opacity-50",
          modern
            ? "rounded-full border border-amber-400/35 bg-black/65 px-2.5 py-1 text-[10px] backdrop-blur-sm"
            : "rounded-xl border border-amber-400/35 bg-amber-500/15 px-3 py-2 text-xs",
        ].join(" ")}
        title={t("admin_report_tag_roleplay")}
        aria-label={t("admin_report_tag_roleplay")}
      >
        <ShieldAlert size={modern ? 12 : 14} strokeWidth={2.2} />
        <span>{t("admin_report_tag_roleplay")}</span>
      </button>
    </div>
  );
}
