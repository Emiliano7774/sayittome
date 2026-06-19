"use client";

import { Flag } from "lucide-react";
import { useState } from "react";

import RoleplayAppealDialog from "@/components/profile/RoleplayAppealDialog";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  uid: string;
  username: string;
  className?: string;
  /** Icon-only red flag — no label, no circle (owner profile). */
  minimal?: boolean;
  compact?: boolean;
};

export default function RoleplayAppealFlagButton({
  uid,
  username,
  className = "",
  minimal = false,
  compact = false,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (!uid) return null;

  const buttonClass = minimal
    ? "touch-manipulation p-1 text-red-500 drop-shadow-[0_1px_4px_rgba(0,0,0,.8)] active:scale-95"
    : compact
      ? "flex h-10 w-10 items-center justify-center rounded-full border border-sky-400/40 bg-sky-500/20 text-sky-100 shadow-lg backdrop-blur-sm touch-manipulation"
      : "flex h-10 w-10 items-center justify-center rounded-full border border-sky-400/40 bg-sky-500/20 text-sky-100 shadow-lg backdrop-blur-sm touch-manipulation sm:h-auto sm:w-auto sm:gap-2 sm:rounded-full sm:px-4 sm:py-2.5 sm:text-sm sm:font-black";

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onTouchEnd={(event) => {
          event.stopPropagation();
        }}
        className={[buttonClass, className].join(" ")}
        aria-label={t("roleplay_appeal_flag_aria")}
        title={t("roleplay_appeal_flag_aria")}
      >
        <Flag size={minimal ? 20 : compact ? 16 : 18} fill="currentColor" />
        {!minimal && !compact ? t("roleplay_appeal_flag_aria") : null}
      </button>

      <RoleplayAppealDialog
        open={open}
        onClose={() => setOpen(false)}
        uid={uid}
        username={username}
      />
    </>
  );
}
