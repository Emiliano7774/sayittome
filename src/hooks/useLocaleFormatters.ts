"use client";

import { useLocale } from "@/contexts/LocaleContext";
import { formatLastSeenLocalized } from "@/lib/i18n/formatLastSeen";

function parseDateValue(value: unknown) {
  if (!value) return null;

  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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
    const date = parseDateValue(value);
    if (!date) return "";

    return date.toLocaleDateString(localeTag, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };
}
