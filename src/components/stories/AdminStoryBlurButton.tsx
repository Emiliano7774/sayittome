"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { useT } from "@/contexts/LocaleContext";
import { useAdminSession } from "@/hooks/useAdminSession";
import { postAdminAction } from "@/lib/admin/postAdminAction";

type Props = {
  storyId: string;
  blurred: boolean;
  onBlurChange: (blurred: boolean) => void;
  chromeHidden?: boolean;
  className?: string;
};

export default function AdminStoryBlurButton({
  storyId,
  blurred,
  onBlurChange,
  chromeHidden = false,
  className = "",
}: Props) {
  const t = useT();
  const { ready, isAdmin, email } = useAdminSession();
  const [busy, setBusy] = useState(false);

  if (!ready || !isAdmin || !storyId) return null;

  async function toggleBlur() {
    if (busy) return;

    const nextBlurred = !blurred;
    setBusy(true);

    try {
      const json = await postAdminAction(email, {
        action: nextBlurred ? "blur_story" : "unblur_story",
        storyId,
      });

      if (!json?.ok) {
        alert(t("admin_story_blur_fail"));
        return;
      }

      onBlurChange(nextBlurred);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggleBlur();
      }}
      disabled={busy}
      data-story-chrome
      className={[
        "absolute right-36 top-6 z-50 inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/35 bg-black/55 text-violet-200 backdrop-blur-sm transition active:scale-95 disabled:opacity-50",
        blurred ? "border-orange-400/40 text-orange-200 ring-1 ring-orange-400/35" : "",
        chromeHidden ? "pointer-events-none opacity-0" : "opacity-100",
        className,
      ].join(" ")}
      title={blurred ? t("admin_story_unblur") : t("admin_story_blur")}
      aria-label={blurred ? t("admin_story_unblur") : t("admin_story_blur")}
    >
      {blurred ? <Eye size={15} strokeWidth={2.2} /> : <EyeOff size={15} strokeWidth={2.2} />}
    </button>
  );
}
