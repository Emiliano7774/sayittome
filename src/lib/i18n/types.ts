export const APP_LOCALES = ["es", "en", "it", "de"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "es";

export const LOCALE_STORAGE_KEY = "sayittome_locale";
export const LOCALE_PROMPT_KEY = "sayittome_locale_prompt_done";

export const LOCALE_LABELS: Record<AppLocale, string> = {
  es: "Español",
  en: "English",
  it: "Italiano",
  de: "Deutsch",
};
