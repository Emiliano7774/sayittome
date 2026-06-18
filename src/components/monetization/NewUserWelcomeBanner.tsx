"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

import PlayStoreButton from "@/components/monetization/PlayStoreButton";
import { isNativeAppShell } from "@/lib/app/nativeShell";
import { useT } from "@/contexts/LocaleContext";

const STORAGE_KEY = "sayittome_play_store_welcome_v1";

type Props = {
  variant?: "classic" | "modern";
  className?: string;
};

export default function NewUserWelcomeBanner({
  variant = "classic",
  className = "",
}: Props) {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isNativeAppShell()) {
      setVisible(false);
      return;
    }

    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
      setVisible(!dismissed);
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  const isModern = variant === "modern";

  return (
    <div
      className={[
        isModern
          ? "relative overflow-hidden rounded-2xl border border-fuchsia-500/20 bg-gradient-to-r from-zinc-950 via-black to-fuchsia-950/40 p-4"
          : "relative overflow-hidden rounded-[1.4rem] border border-violet-400/20 bg-[#070707] p-4",
        className,
      ].join(" ")}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("apk_welcome_dismiss")}
        className="absolute right-3 top-3 rounded-full p-1.5 text-white/35 transition hover:bg-white/10 hover:text-white/70"
      >
        <X size={16} />
      </button>

      <div className="relative flex flex-wrap items-center justify-between gap-3 pr-8">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={[
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              isModern ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-violet-500/15 text-violet-300",
            ].join(" ")}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <p
              className={[
                "text-xs font-black uppercase tracking-[0.28em]",
                isModern ? "text-fuchsia-300/90" : "text-violet-300/90",
              ].join(" ")}
            >
              {t("apk_welcome_tag")}
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-300">{t("apk_welcome_body")}</p>
          </div>
        </div>

        <PlayStoreButton
          label={t("apk_download")}
          className={
            isModern
              ? "rounded-full bg-white px-5 py-2.5 text-sm font-normal text-black transition active:scale-[0.98]"
              : "rounded-full bg-gradient-to-r from-[#5f58ff] to-[#7256ff] px-5 py-2.5 text-sm font-medium text-white shadow-[0_0_30px_rgba(105,82,255,0.35)] transition active:scale-[0.98]"
          }
        />
      </div>
    </div>
  );
}
