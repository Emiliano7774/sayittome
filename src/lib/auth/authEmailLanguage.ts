import type { AppLocale } from "@/lib/i18n/types";
import { auth } from "@/lib/firebase";

const AUTH_LANGUAGE: Record<AppLocale, string> = {
  es: "es",
  en: "en",
  it: "it",
  de: "de",
};

/** Firebase's verification email follows this code. Default is English. */
export function applyAuthEmailLanguage(locale: AppLocale | string) {
  auth.languageCode = AUTH_LANGUAGE[locale as AppLocale] || "es";
}
