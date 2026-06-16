"use client";

import { Flag } from "lucide-react";
import { useState } from "react";

import ContentReportDialog, { type ContentReportKind } from "@/components/moderation/ContentReportDialog";
import { useT } from "@/contexts/LocaleContext";

type Props = {
  targetUid: string;
  targetUsername: string;
  defaultKind?: ContentReportKind;
  className?: string;
  compact?: boolean;
};

export default function ProfileReportButton({
  targetUid,
  targetUsername,
  defaultKind = "perfil",
  className = "",
  compact = false,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (!targetUid && !targetUsername) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          compact
            ? "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-amber-200 backdrop-blur-md"
            : "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-amber-200",
          className,
        ].join(" ")}
        aria-label={t("report_title")}
      >
        <Flag size={compact ? 16 : 15} />
        {compact ? null : t("report_title")}
      </button>

      <ContentReportDialog
        open={open}
        onClose={() => setOpen(false)}
        kind={defaultKind}
        targetUid={targetUid}
        targetUsername={targetUsername}
      />
    </>
  );
}
