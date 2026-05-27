"use client";

import { useLocale, useLocaleLabel } from "@/contexts/LocaleContext";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/types";

type Props = {
  compact?: boolean;
};

export default function LanguageSwitcher({ compact = false }: Props) {
  const { locale, setLocale } = useLocale();

  return (
    <div
      className="flex max-w-full shrink-0 rounded-full border border-white/10 bg-zinc-950/90 p-0.5 text-[10px] font-semibold shadow-lg shadow-black/30 backdrop-blur sm:p-1 sm:text-xs"
      role="group"
      aria-label="Language"
    >
      {APP_LOCALES.map((code) => (
        <LanguageOption
          key={code}
          code={code}
          compact={compact}
          active={locale === code}
          onSelect={() => setLocale(code)}
        />
      ))}
    </div>
  );
}

function LanguageOption({
  code,
  compact,
  active,
  onSelect,
}: {
  code: AppLocale;
  compact: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const label = useLocaleLabel(code);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? "rounded-full bg-white px-2 py-1.5 text-black transition sm:px-3 sm:py-2"
          : "rounded-full px-2 py-1.5 text-zinc-500 transition hover:text-white sm:px-3 sm:py-2"
      }
    >
      {compact ? code.toUpperCase() : label.slice(0, 2).toUpperCase()}
    </button>
  );
}
