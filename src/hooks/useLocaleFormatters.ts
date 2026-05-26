"use client";

import { useLocale } from "@/contexts/LocaleContext";
import { formatLastSeenLocalized } from "@/lib/i18n/formatLastSeen";

export function useFormatLastSeen() {
  const { locale } = useLocale();

  return (lastActive?: string | null, online?: boolean) =>
    formatLastSeenLocalized(locale, lastActive, online);
}

export function useLocaleDateFormatter() {
  const { locale } = useLocale();

  const localeTag =
    locale === "es"
      ? "es-AR"
      : locale === "en"
        ? "en-US"
        : locale === "it"
          ? "it-IT"
          : "de-DE";

  return (value: unknown) => {
    const date = (value as { toDate?: () => Date })?.toDate?.();
    if (!date) return "";

    return date.toLocaleDateString(localeTag, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };
}
