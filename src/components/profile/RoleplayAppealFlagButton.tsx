"use client";

import { Flag } from "lucide-react";
import { useState } from "react";

import RoleplayAppealDialog from "@/components/profile/RoleplayAppealDialog";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  uid: string;
  username: string;
  className?: string;
};

export default function RoleplayAppealFlagButton({ uid, username, className = "" }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (!uid) return null;

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
        className={[
          "flex h-10 w-10 items-center justify-center rounded-full border border-sky-400/40 bg-sky-500/20 text-sky-100 shadow-lg backdrop-blur-sm touch-manipulation",
          className,
        ].join(" ")}
        aria-label={t("roleplay_appeal_flag_aria")}
        title={t("roleplay_appeal_flag_aria")}
      >
        <Flag size={18} fill="currentColor" />
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
