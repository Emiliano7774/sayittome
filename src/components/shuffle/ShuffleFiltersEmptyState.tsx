"use client";

import { Shuffle, Sparkles } from "lucide-react";

import { useT } from "@/contexts/LocaleContext";

type Props = {
  variant: "modern" | "classic";
  soloOnline: boolean;
  onClearFilters: () => void;
  onKeepTrying?: () => void;
  errorText?: string | null;
};

export default function ShuffleFiltersEmptyState({
  variant,
  soloOnline,
  onClearFilters,
  onKeepTrying,
  errorText,
}: Props) {
  const t = useT();
  const isModern = variant === "modern";

  const titleClass = isModern
    ? "text-2xl font-black text-white/35"
    : "text-lg font-normal text-white/40";
  const noteClass = isModern
    ? "mt-4 max-w-lg text-sm font-bold leading-6 text-white/45"
    : "mt-4 max-w-lg text-sm font-normal leading-6 text-white/38";
  const clearButtonClass = isModern
    ? "mt-5 rounded-full border border-violet-500/30 bg-violet-500/10 px-5 py-2.5 text-sm font-black text-violet-200"
    : "mt-5 rounded-full border border-[#8C84FF]/30 bg-[#8C84FF]/10 px-5 py-2.5 text-sm font-normal text-[#8C84FF]/90";
  const keepTryingClass = isModern
    ? "mt-5 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-5 py-2.5 text-sm font-black text-amber-200"
    : "mt-5 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-5 py-2.5 text-sm font-black text-amber-200";

  return (
    <div
      className={[
        "flex flex-col items-center justify-center px-6 text-center",
        isModern ? "h-[50vh]" : "h-[42vh]",
      ].join(" ")}
    >
      <p className={titleClass}>{t("shuffle_no_profiles_filters")}</p>

      {soloOnline && !errorText ? (
        <p
          data-shuffle-online-privacy-note="1"
          className={noteClass}
        >
          {t("shuffle_filters_empty_online_note")}
        </p>
      ) : null}

      {isModern ? (
        onKeepTrying ? (
          <button type="button" onClick={onKeepTrying} className={keepTryingClass}>
            <Sparkles size={16} className="shrink-0" />
            <span>{t("shuffle_filters_empty_keep_trying")}</span>
            <Shuffle size={16} className="shrink-0 opacity-80" />
          </button>
        ) : (
          <p className={keepTryingClass}>
            <Sparkles size={16} className="shrink-0" />
            <span>{t("shuffle_filters_empty_keep_trying")}</span>
            <Shuffle size={16} className="shrink-0 opacity-80" />
          </p>
        )
      ) : null}

      <button type="button" onClick={onClearFilters} className={clearButtonClass}>
        {t("shuffle_filters_clear")}
      </button>

      {errorText ? (
        <p
          className={`mt-3 text-white/40 ${isModern ? "font-bold" : "max-w-3xl font-normal text-white/35"}`}
        >
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
