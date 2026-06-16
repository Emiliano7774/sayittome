"use client";

import { Info } from "lucide-react";

import { useT } from "@/contexts/LocaleContext";

type Props = {
  tag?: string;
  className?: string;
};

export default function ProfileModerationTag({ tag, className = "" }: Props) {
  const t = useT();

  if (tag !== "roleplay") return null;

  return (
    <div
      className={[
        "inline-flex max-w-full items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-left",
        className,
      ].join(" ")}
      title={t("profile_moderation_roleplay_hint")}
    >
      <Info size={16} className="mt-0.5 shrink-0 text-amber-200/80" />
      <div className="min-w-0">
        <p className="text-sm font-black text-amber-100">{t("profile_moderation_roleplay_title")}</p>
        <p className="mt-1 text-xs font-semibold leading-snug text-amber-100/70">
          {t("profile_moderation_roleplay_hint")}
        </p>
      </div>
    </div>
  );
}
