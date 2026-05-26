"use client";

import { useState } from "react";
import { Globe2 } from "lucide-react";

import { useLocale, useLocaleLabel } from "@/contexts/LocaleContext";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/types";

type Props = {
  currentLocale: AppLocale;
  suggestedLocale: AppLocale;
  onKeepCurrent: () => void;
  onUseSuggested: () => void;
  onChoose: (locale: AppLocale) => void;
};

export default function LanguagePromptModal({
  currentLocale,
  suggestedLocale,
  onKeepCurrent,
  onUseSuggested,
  onChoose,
}: Props) {
  const { t } = useLocale();
  const [showPicker, setShowPicker] = useState(false);
  const suggestedLabel = useLocaleLabel(suggestedLocale);
  const currentLabel = useLocaleLabel(currentLocale);
  const sameLocale = currentLocale === suggestedLocale;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="language-prompt-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-violet-500/35 bg-[#07070B] p-6 shadow-[0_16px_34px_rgba(108,99,255,0.22)]">
        <div className="flex items-start gap-3">
          <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5D5FEF] to-[#8C84FF]">
            <Globe2 size={21} className="text-white" />
          </div>
          <div>
            <h2 id="language-prompt-title" className="text-[22px] font-black text-white">
              {t("language_prompt_title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              {t("language_prompt_body", { language: suggestedLabel })}
            </p>
          </div>
        </div>

        {!showPicker ? (
          <div className="mt-6 space-y-3">
            {!sameLocale ? (
              <button
                type="button"
                onClick={onUseSuggested}
                className="w-full rounded-[18px] bg-[#6C63FF] py-3.5 text-sm font-black text-white"
              >
                {t("language_prompt_use_detected", { language: suggestedLabel })}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onKeepCurrent}
              className={[
                "w-full rounded-[18px] py-3.5 text-sm font-extrabold",
                sameLocale
                  ? "bg-[#6C63FF] text-white"
                  : "border border-white/10 bg-white/[0.055] text-white/80",
              ].join(" ")}
            >
              {t("language_prompt_keep", { language: currentLabel })}
            </button>

            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="w-full rounded-[18px] py-3.5 text-sm font-extrabold text-violet-300"
            >
              {t("language_prompt_other")}
            </button>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {APP_LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onChoose(code)}
                className={[
                  "rounded-[18px] border py-3.5 text-sm font-black transition",
                  code === currentLocale
                    ? "border-violet-300 bg-violet-500/20 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/75 hover:border-violet-400/40",
                ].join(" ")}
              >
                {t(`lang_${code}` as "lang_es")}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
