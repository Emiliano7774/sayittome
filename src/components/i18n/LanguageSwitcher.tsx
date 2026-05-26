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
      className="flex rounded-full border border-white/10 bg-zinc-950/90 p-1 text-xs font-semibold shadow-lg shadow-black/30 backdrop-blur"
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
          ? "rounded-full bg-white px-3 py-2 text-black transition"
          : "rounded-full px-3 py-2 text-zinc-500 transition hover:text-white"
      }
    >
      {compact ? code.toUpperCase() : label.slice(0, 2).toUpperCase()}
    </button>
  );
}
