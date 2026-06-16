"use client";

import { useState } from "react";

import { useT } from "@/contexts/LocaleContext";

type Props = {
  tag?: string;
  className?: string;
};

export default function ProfileModerationTag({ tag, className = "" }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (tag !== "roleplay") return null;

  return (
    <div className={["relative z-[40]", className].join(" ")}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-full border border-amber-400/35 bg-black/50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-amber-100 backdrop-blur-sm"
        aria-expanded={open}
      >
        {t("profile_moderation_roleplay_title")}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[45]"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-[46] max-w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-amber-400/25 bg-zinc-950/95 px-4 py-3 text-left shadow-2xl">
            <p className="text-xs font-semibold leading-snug text-amber-100/80">
              {t("profile_moderation_roleplay_hint")}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
